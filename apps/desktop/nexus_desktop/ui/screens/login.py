"""Inicio de sesión con correo y contraseña de NEXUS. La contraseña nunca se guarda."""
from __future__ import annotations

from tkinter import ttk

from nexus_desktop.nexus.session import LoginError
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.theme import TOKENS

GENERIC_ERROR = "No se pudo iniciar sesión. Revisa la conexión e inténtalo de nuevo."
EMPTY_FIELDS = "Escribe tu correo y tu contraseña."
NO_CONNECTION = "No se pudo preparar la conexión con NEXUS."


class LoginScreen(Screen):
    def __init__(self, master, app, message: str | None = None, email: str | None = None) -> None:
        super().__init__(master, app)
        card = ttk.Frame(self, style="Panel.TFrame", padding=28)
        card.place(relx=0.5, rely=0.42, anchor="center")

        ttk.Label(card, text="Iniciar sesión", style="Title.TLabel",
                  background=TOKENS["surface"]).grid(row=0, column=0, sticky="w")
        ttk.Label(card, text="Usa tu cuenta de NEXUS.", style="Panel.Muted.TLabel").grid(
            row=1, column=0, sticky="w", pady=(2, 18))

        ttk.Label(card, text="Correo", style="Panel.TLabel").grid(row=2, column=0, sticky="w")
        self.email_entry = ttk.Entry(card, width=36)
        self.email_entry.grid(row=3, column=0, sticky="ew", pady=(4, 12))
        if email:
            self.email_entry.insert(0, email)

        ttk.Label(card, text="Contraseña", style="Panel.TLabel").grid(row=4, column=0, sticky="w")
        self.password_entry = ttk.Entry(card, width=36, show="*")
        self.password_entry.grid(row=5, column=0, sticky="ew", pady=(4, 12))

        self.error_label = ttk.Label(card, text=message or "", style="Panel.TLabel",
                                     foreground=TOKENS["critical"], wraplength=300, justify="left")
        self.error_label.grid(row=6, column=0, sticky="w", pady=(0, 10))

        self.submit_button = ttk.Button(card, text="Iniciar sesión", style="Accent.TButton",
                                        command=self.submit)
        self.submit_button.grid(row=7, column=0, sticky="ew")

        for widget in (self.email_entry, self.password_entry):
            widget.bind("<Return>", lambda _e: self.submit())

        if app.config_error or app.session is None:
            self.error_label.configure(text=app.config_error or NO_CONNECTION)
            for widget in (self.email_entry, self.password_entry, self.submit_button):
                widget.state(["disabled"])

    def on_show(self) -> None:
        if self.submit_button.instate(["disabled"]):  # falta configuración: nada que escribir
            return
        target = self.password_entry if self.email_entry.get() else self.email_entry
        target.focus_set()

    def submit(self) -> None:
        if self.submit_button.instate(["disabled"]):
            return
        email = self.email_entry.get().strip()
        password = self.password_entry.get()
        if not email or not password:
            self.error_label.configure(text=EMPTY_FIELDS)
            return
        self.password_entry.delete(0, "end")  # no queda en el widget tras el intento
        self._set_busy(True)
        session = self.app.session
        self.run_async(lambda: session.login(email, password), self._logged_in, self._failed)

    def _set_busy(self, busy: bool) -> None:
        flag = ["disabled"] if busy else ["!disabled"]
        for widget in (self.email_entry, self.password_entry, self.submit_button):
            widget.state(flag)
        self.error_label.configure(text="Iniciando sesión…" if busy else "",
                                   foreground=TOKENS["text_muted"] if busy else TOKENS["critical"])

    def _logged_in(self, _result) -> None:
        from nexus_desktop.ui.screens.start import StartScreen

        self.app.show(StartScreen)

    def _failed(self, exc: Exception) -> None:
        self._set_busy(False)
        # El mensaje de LoginError es legible y sin datos sensibles; cualquier otro error
        # se resume en uno genérico (nunca se muestra su texto).
        self.error_label.configure(text=str(exc) if isinstance(exc, LoginError) else GENERIC_ERROR)
        self.password_entry.focus_set()
