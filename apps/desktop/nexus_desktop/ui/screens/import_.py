"""STUB (Task 12): pantalla de importación de la carpeta WTG.

Solo existe para que el botón "Importar carpeta WTG" del inicio tenga a dónde ir.
Task 12 la sustituye por la importación real (elegir carpeta → scan_wtg → palas y caras).
"""
from __future__ import annotations

from tkinter import ttk

from nexus_desktop.ui.screens.base import Screen


class ImportScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        state = app.state
        ttk.Label(self, text="Importar carpeta WTG", style="Title.TLabel").pack(anchor="w")
        if state.project is not None and state.asset is not None:
            ttk.Label(self, text=f"{state.project.name} · {state.asset.name}",
                      style="Muted.TLabel").pack(anchor="w", pady=(4, 0))
        ttk.Label(self, text="Próximamente").pack(anchor="w", pady=(16, 16))
        ttk.Button(self, text="Volver", command=self._back).pack(anchor="w")

    def _back(self) -> None:
        from nexus_desktop.ui.screens.start import StartScreen

        self.app.show(StartScreen)
