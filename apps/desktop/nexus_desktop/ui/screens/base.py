"""Pantalla base: cada pantalla es un ttk.Frame que la App crea al mostrarla y destruye al salir."""
from __future__ import annotations

from tkinter import ttk
from typing import TYPE_CHECKING, Any, Callable

from nexus_desktop.nexus.session import SessionLost

if TYPE_CHECKING:
    from nexus_desktop.ui.app import App


class Screen(ttk.Frame):
    def __init__(self, master, app: "App", **kwargs: Any) -> None:
        super().__init__(master, padding=24)
        self.app = app

    def on_show(self) -> None:
        """La pantalla ya es la actual (aquí se lanzan las cargas iniciales)."""

    def on_hide(self) -> None:
        """La pantalla va a dejar de mostrarse (justo antes de destruirse)."""

    @property
    def is_current(self) -> bool:
        return self.app.current is self

    def run_async(self, fn: Callable[[], Any], on_done: Callable[[Any], None],
                  on_error: Callable[[Exception], None]) -> None:
        """Como App.run_async, pero los resultados que llegan cuando la pantalla ya no es la
        actual se descartan, y SessionLost siempre lleva al login."""

        def done(result: Any) -> None:
            if self.is_current:
                on_done(result)

        def failed(exc: Exception) -> None:
            if not self.is_current:
                return
            if isinstance(exc, SessionLost):
                self.app.session_lost()
            else:
                on_error(exc)

        self.app.run_async(fn, done, failed)
