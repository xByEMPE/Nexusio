"""STUB (Task 14): pantalla de subida.

Solo existe para que «Continuar a la subida» de la verificación tenga a dónde ir. Task 14 la
sustituye por la subida real, que lee `app.state.sections` (domain.reconstruction.SectionResult:
tira, calibración en píxeles de la tira guardada y radio/GSD por foto) y `app.state.strips`.
"""
from __future__ import annotations

from tkinter import ttk

from nexus_desktop.ui.screens.base import Screen


class UploadScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        ttk.Label(self, text="Subida", style="Title.TLabel").pack(anchor="w")
        ttk.Label(self, text="Próximamente").pack(anchor="w", pady=(16, 16))
        self.back_button = ttk.Button(self, text="Volver a verificación", command=self._back)
        self.back_button.pack(anchor="w")

    def _back(self) -> None:
        from nexus_desktop.ui.screens.verification import VerificationScreen

        self.app.show(VerificationScreen)
