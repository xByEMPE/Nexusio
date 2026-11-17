"""Procesamiento: reconstrucción de las tiras (de `_show_processing_screen` y
`_process_reconstruction` del original).

Mismo flujo: al entrar se lanza el cálculo en segundo plano con barra de progreso y registro;
al terminar se pasa a los resultados. Además: botón «Cancelar» (se conserva lo ya cosido), los
errores se muestran aquí con «Reintentar» y «Volver al marcado».

`reconstruct` corre en un hilo de trabajo y solo informa por `_report`, que encola el mensaje;
la cola se lee en el hilo de Tk con `after()` (Tk no es seguro entre hilos).
"""
from __future__ import annotations

import queue
import threading
import tkinter as tk
from tkinter import ttk

from nexus_desktop import config
from nexus_desktop.config import resolve_exiftool
from nexus_desktop.domain.exif import ExifTimeout
from nexus_desktop.domain.reconstruction import reconstruct
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.theme import TOKENS, font
from nexus_desktop.vision.segmenter import BladeSegmenter, find_model

POLL_MS = 100
EXIFTOOL_MISSING = ("No se encontró exiftool, necesario para leer la altitud y la distancia de "
                    "cada foto. Indica su ruta en la variable NEXUS_EXIFTOOL o agrégalo al PATH.")
NO_STRIPS = "No se generó ninguna tira: revisa el registro."
MISSING_STATE = "Falta la carpeta WTG, las marcas o la longitud de pala: vuelve al marcado."


def load_segmenter() -> tuple[BladeSegmenter | None, str | None]:
    """Carga el modelo U-Net (NEXUS_MODEL_PATH, apps/desktop/models/ o junto al ejecutable).

    Devuelve (segmentador, None); (None, None) si no hay modelo (`reconstruct` ya avisa de la
    costura simple), o (None, aviso) si el modelo existe pero no se pudo cargar. Tarda: llamar
    desde el hilo de trabajo."""
    path = find_model(config.model_search_paths())
    if path is None:
        return None, None
    try:
        return BladeSegmenter(path), None
    except Exception as exc:  # modelo dañado, onnxruntime ausente…: se cose sin máscaras
        return None, (f"Aviso: no se pudo cargar el modelo de segmentación {path.name} "
                      f"({type(exc).__name__}); se usa la costura simple.")


def error_message(exc: Exception) -> str:
    if isinstance(exc, ExifTimeout):  # ya es un mensaje en español
        return str(exc)
    if isinstance(exc, FileNotFoundError):
        what = exc.filename or str(exc)
        return (f"Error: no se encontró {what}. Revisa exiftool (NEXUS_EXIFTOOL) y que la carpeta "
                "WTG siga en su sitio.")
    if isinstance(exc, OSError):
        return f"Error al leer o guardar archivos: {exc}"
    return f"Error en el procesamiento ({type(exc).__name__}): {exc}"


class ProcessingScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        self._queue: queue.SimpleQueue = queue.SimpleQueue()
        self._cancel = threading.Event()
        self._poll_job: str | None = None
        self.running = False
        self.results: list = []
        self.log_lines: list[str] = []  # el registro, también tras salir de la pantalla

        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="Procesamiento de tiras", style="Title.TLabel").pack(side="left")
        state = app.state
        subtitle = [x.name for x in (state.project, state.asset) if x is not None]
        if state.wtg is not None and state.wtg.path.name not in subtitle:
            subtitle.append(state.wtg.path.name)
        ttk.Label(top, text=" · ".join(subtitle), style="Muted.TLabel").pack(side="left", padx=(12, 0))

        self.status_label = ttk.Label(self, text="Preparando…", wraplength=900, justify="left")
        self.status_label.pack(anchor="w", pady=(16, 6))
        self.progress_bar = ttk.Progressbar(self, orient="horizontal", mode="determinate", maximum=100)
        self.progress_bar.pack(fill="x")

        footer = ttk.Frame(self)
        footer.pack(side="bottom", fill="x", pady=(12, 0))
        self.cancel_button = ttk.Button(footer, text="Cancelar", style="Danger.TButton", command=self.cancel)
        self.cancel_button.pack(side="left")
        self.results_button = ttk.Button(footer, text="Ver resultados", style="Accent.TButton",
                                         command=self._show_results)
        self.results_button.pack(side="right")
        self.retry_button = ttk.Button(footer, text="Reintentar", command=self.start)
        self.retry_button.pack(side="right", padx=(0, 8))
        self.back_button = ttk.Button(footer, text="Volver al marcado", command=self._back)
        self.back_button.pack(side="right", padx=(0, 8))

        log_frame = ttk.Frame(self, style="Panel.TFrame", padding=8)
        log_frame.pack(fill="both", expand=True, pady=(12, 0))
        self.log_text = tk.Text(log_frame, height=14, wrap="word", background=TOKENS["surface"],
                                foreground=TOKENS["text_muted"], insertbackground=TOKENS["text"],
                                relief="flat", borderwidth=0, font=font(9))
        scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scroll.set, state="disabled")
        scroll.pack(side="right", fill="y")
        self.log_text.pack(side="left", fill="both", expand=True)
        self._set_buttons(running=False, can_retry=False)

    def on_show(self) -> None:
        self.start()

    # --- ciclo del cálculo ---

    def start(self) -> None:
        if self.running:
            return
        state = self.app.state
        if state.wtg is None or state.marks is None or not state.blade_length_m:
            self._finish_with(MISSING_STATE, TOKENS["critical"], can_retry=False)
            return
        exiftool = resolve_exiftool()
        if exiftool is None:
            self._finish_with(EXIFTOOL_MISSING, TOKENS["critical"], can_retry=True)
            return
        self._cancel = threading.Event()
        cancel, wtg, marks, length = self._cancel, state.wtg, state.marks, state.blade_length_m
        self.running = True
        self.results = []
        self.progress_bar.configure(value=0)
        self._set_status("Procesando…", TOKENS["text"])
        self._log("Inicio del procesamiento.")
        self._set_buttons(running=True, can_retry=False)

        def work():
            self._report("Cargando el modelo de segmentación…", 0.0)
            segmenter, warning = load_segmenter()
            if warning:
                self._report(warning, 0.0)
            return reconstruct(wtg, marks, length, segmenter, exiftool, wtg.path, self._report, cancel)

        self.run_async(work, self._done, self._failed)
        self._schedule_poll()

    def _report(self, message: str, fraction: float) -> None:
        """Lo llama `reconstruct` desde el hilo de trabajo: solo encola."""
        self._queue.put((message, fraction))

    def _schedule_poll(self) -> None:
        if self._poll_job is None:
            self._poll_job = self.after(POLL_MS, self._poll_tick)

    def _poll_tick(self) -> None:
        self._poll_job = None
        self._poll()
        if self.running:
            self._schedule_poll()

    def _poll(self) -> None:
        """Pasa a la pantalla los mensajes encolados (hilo de Tk)."""
        while True:
            try:
                message, fraction = self._queue.get_nowait()
            except queue.Empty:
                return
            self.progress_bar.configure(value=max(0.0, min(1.0, fraction)) * 100)
            self._log(message)
            if self.running and not self._cancel.is_set():
                self._set_status(message, TOKENS["text"])

    def _done(self, results: list) -> None:
        self._poll()
        self.running = False
        self.results = list(results)
        state = self.app.state
        state.sections = self.results
        state.strips = {}  # las fija la verificación
        if self._cancel.is_set():
            self._finish_with(f"Procesamiento cancelado: {len(self.results)} tira(s) terminada(s). "
                              "Puedes ver los resultados parciales o volver al marcado.",
                              TOKENS["caution"], can_retry=True)
        elif not self.results:
            self._finish_with(NO_STRIPS, TOKENS["caution"], can_retry=True)
        else:
            self._show_results()

    def _failed(self, exc: Exception) -> None:
        self._poll()
        self.running = False
        message = error_message(exc)
        self._log(message)
        self._finish_with(message, TOKENS["critical"], can_retry=True)

    def cancel(self) -> None:
        if not self.running:
            return
        self._cancel.set()
        self.cancel_button.state(["disabled"])
        self._set_status("Cancelando… se termina la foto en curso.", TOKENS["caution"])

    # --- presentación ---

    def _finish_with(self, message: str, color: str, *, can_retry: bool) -> None:
        self._set_status(message, color)
        self._set_buttons(running=False, can_retry=can_retry)

    def _set_status(self, text: str, color: str) -> None:
        self.status_label.configure(text=text, foreground=color)

    def _log(self, message: str) -> None:
        self.log_lines.append(message)
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _set_buttons(self, *, running: bool, can_retry: bool) -> None:
        def enable(button: ttk.Button, on: bool) -> None:
            button.state(["!disabled"] if on else ["disabled"])

        enable(self.cancel_button, running)
        enable(self.back_button, not running)
        enable(self.retry_button, not running and can_retry)
        enable(self.results_button, not running and bool(self.results))

    # --- navegación ---

    def _show_results(self) -> None:
        from nexus_desktop.ui.screens.results import ResultsScreen

        if self.results:
            self.app.show(ResultsScreen)

    def _back(self) -> None:
        from nexus_desktop.ui.screens.marking import MarkingScreen

        if not self.running:
            self.app.show(MarkingScreen)

    def on_hide(self) -> None:
        self._cancel.set()  # si se sale mientras procesa, el hilo para en la próxima foto
        if self._poll_job is not None:
            self.after_cancel(self._poll_job)
            self._poll_job = None
