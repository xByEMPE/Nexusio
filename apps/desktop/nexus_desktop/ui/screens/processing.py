"""STUB (Task 13): pantalla de procesamiento (reconstrucción de tiras).

Solo existe para que "Continuar" del marcado tenga a dónde ir. Task 13 la sustituye por el
procesamiento real, que lee `app.state.wtg`, `app.state.marks` y `app.state.blade_length_m`.
"""
from __future__ import annotations

from tkinter import ttk

from nexus_desktop.ui.screens.base import Screen


class ProcessingScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        ttk.Label(self, text="Procesamiento", style="Title.TLabel").pack(anchor="w")
        ttk.Label(self, text="Próximamente").pack(anchor="w", pady=(16, 16))
        ttk.Button(self, text="Volver al marcado", command=self._back).pack(anchor="w")

    def _back(self) -> None:
        from nexus_desktop.ui.screens.marking import MarkingScreen

        self.app.show(MarkingScreen)
