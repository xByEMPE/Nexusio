"""Tareas en segundo plano para la interfaz: el trabajo (red, disco) corre en otro hilo y el
resultado se entrega en el hilo de Tk con `after()`, así la ventana nunca se congela.

Tk no es seguro entre hilos: `fn` no debe tocar widgets; `on_done`/`on_error` sí pueden.
"""
from __future__ import annotations

import queue
import threading
import time
import tkinter as tk
from typing import Any, Callable

POLL_MS = 40


class TaskRunner:
    def __init__(self, root: tk.Misc, poll_ms: int = POLL_MS) -> None:
        self._root = root
        self._poll_ms = poll_ms
        self._queue: queue.SimpleQueue = queue.SimpleQueue()
        self._pending = 0
        self._after_id: str | None = None

    @property
    def pending(self) -> int:
        return self._pending

    def run_async(self, fn: Callable[[], Any], on_done: Callable[[Any], None],
                  on_error: Callable[[Exception], None] | None = None) -> None:
        """Ejecuta `fn()` en un hilo; luego llama `on_done(resultado)` u `on_error(excepción)`
        en el hilo de Tk. Llamar solo desde el hilo de Tk."""
        self._pending += 1

        def work() -> None:
            try:
                result = fn()
            except Exception as exc:  # se entrega a on_error en el hilo de Tk
                self._queue.put((on_error, exc, True))
            else:
                self._queue.put((on_done, result, False))

        threading.Thread(target=work, name="nexus-ui-task", daemon=True).start()
        self._schedule()

    def _schedule(self) -> None:
        if self._after_id is None:
            try:
                self._after_id = self._root.after(self._poll_ms, self._poll)
            except tk.TclError:  # la ventana ya se cerró
                self._after_id = None

    def _poll(self) -> None:
        self._after_id = None
        self._drain()
        if self._pending:
            self._schedule()

    def _drain(self) -> None:
        while True:
            try:
                callback, value, failed = self._queue.get_nowait()
            except queue.Empty:
                return
            self._pending -= 1
            try:
                if callback is None:
                    if failed:
                        raise value
                else:
                    callback(value)
            except Exception as exc:
                self._root.report_callback_exception(type(exc), exc, exc.__traceback__)

    def pump(self, timeout: float = 5.0) -> None:
        """Para pruebas: espera a que terminen todas las tareas (incluidas las que lancen sus
        callbacks) y entrega sus resultados en este hilo."""
        deadline = time.monotonic() + timeout
        while True:
            self._drain()
            self._root.update()
            if not self._pending:
                return
            if time.monotonic() > deadline:
                raise TimeoutError(f"{self._pending} tarea(s) sin terminar")
            time.sleep(0.005)
