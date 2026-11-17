"""Ventana principal: cabecera con el logo y una pantalla (Screen) a la vez."""
from __future__ import annotations

import tkinter as tk
from dataclasses import dataclass, field
from tkinter import ttk
from typing import Any, Callable

from nexus_desktop.domain.marking import MarkingState
from nexus_desktop.domain.wtg_folder import WtgFolder
from nexus_desktop.nexus.projects import Asset, Project
from nexus_desktop.nexus.session import Session
from nexus_desktop.ui import theme
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.threading import TaskRunner

WINDOW_TITLE = "NEXUS · Importador de palas"
SESSION_EXPIRED = "La sesión caducó; inicia sesión de nuevo."
MISSING_KEY = ("Falta la llave pública de NEXUS. Debe estar en el archivo {path} "
               "(claves supabase_url y supabase_publishable_key) o en la variable de entorno "
               "NEXUS_PUBLISHABLE_KEY. Pide la configuración a tu administrador y vuelve a "
               "abrir la app.")
CLIENT_ERROR = ("No se pudo preparar la conexión con NEXUS. Revisa la configuración "
                "({path}, o NEXUS_SUPABASE_URL y NEXUS_PUBLISHABLE_KEY) y vuelve a abrir la app.")


@dataclass
class AppState:
    """Lo elegido y calculado a lo largo del flujo (lo comparten las pantallas)."""
    wtg: WtgFolder | None = None
    project: Project | None = None
    asset: Asset | None = None
    blade_length_m: float | None = None
    marks: MarkingState | None = None  # punta y raíz de las secciones de `wtg`
    # Tiras para la subida: {(pala, cara): ruta}; las fija la verificación.
    strips: dict = field(default_factory=dict)
    # Resultado del procesamiento: domain.reconstruction.SectionResult por sección cosida
    # (tira, calibración en píxeles de la tira guardada, radio y GSD de cada foto).
    sections: list = field(default_factory=list)

    def forget_folder(self) -> None:
        """Olvida la carpeta WTG y todo lo calculado sobre ella (marcas, tiras, resultados)."""
        self.wtg, self.marks, self.blade_length_m = None, None, None
        self.strips, self.sections = {}, []


def create_session() -> tuple[Session | None, str | None]:
    """Crea la sesión con la configuración; si falta algo devuelve (None, mensaje en español)."""
    from nexus_desktop import config

    path = config.user_config_path()
    if not config.SUPABASE_PUBLISHABLE_KEY:
        return None, MISSING_KEY.format(path=path)
    try:
        return Session(), None
    except Exception:  # URL inválida u otro fallo del cliente: sin traza ni datos sensibles
        return None, CLIENT_ERROR.format(path=path)


class App(tk.Tk):
    # Nota: `state` (AppState) oculta el método Tk.state(); para el estado de la ventana
    # usar wm_state().
    def __init__(self, session: Session | None = None, config_error: str | None = None,
                 start: bool = True) -> None:
        super().__init__()
        self.title(WINDOW_TITLE)
        self.geometry("1000x680")
        self.minsize(760, 520)
        theme.apply_theme(self)
        self.session = session
        self.config_error = config_error
        self.state = AppState()
        self.tasks = TaskRunner(self)
        self.current: Screen | None = None
        self._build_header()
        self.body = ttk.Frame(self)
        self.body.pack(fill="both", expand=True)
        if start:
            from nexus_desktop.ui.screens.login import LoginScreen
            self.show(LoginScreen)

    def _build_header(self) -> None:
        header = ttk.Frame(self, style="Panel.TFrame", padding=(16, 10))
        header.pack(fill="x")
        try:
            self._icon = tk.PhotoImage(master=self, file=str(theme.logo_path()))
            self._logo = self._icon.subsample(6)
            self.iconphoto(True, self._icon)
            ttk.Label(header, image=self._logo, style="Panel.TLabel").pack(side="left", padx=(0, 10))
        except tk.TclError:
            self._icon = self._logo = None
        ttk.Label(header, text="NEXUS", style="Panel.TLabel",
                  font=theme.font(14, "bold")).pack(side="left")
        ttk.Label(header, text="Importador de palas", style="Panel.Muted.TLabel").pack(
            side="left", padx=(10, 0))

    def show(self, screen_cls: type[Screen], **kwargs: Any) -> Screen:
        """Destruye la pantalla actual y muestra una nueva de `screen_cls`."""
        if self.current is not None:
            old, self.current = self.current, None
            old.on_hide()
            old.destroy()
        screen = screen_cls(self.body, self, **kwargs)
        screen.pack(fill="both", expand=True)
        self.current = screen
        screen.on_show()
        return screen

    def run_async(self, fn: Callable[[], Any], on_done: Callable[[Any], None],
                  on_error: Callable[[Exception], None] | None = None) -> None:
        self.tasks.run_async(fn, on_done, on_error)

    def session_lost(self) -> None:
        """La sesión caducó: vuelve al login. Se conserva lo elegido (el avance está en el índice)."""
        from nexus_desktop.ui.screens.login import LoginScreen

        email = self.session.email if self.session is not None else None
        if self.session is not None:
            self.session.email = None
        self.show(LoginScreen, message=SESSION_EXPIRED, email=email)

    def logout(self) -> None:
        """Cierra la sesión en segundo plano y vuelve al login con el estado limpio."""
        from nexus_desktop.ui.screens.login import LoginScreen

        def back(_result: Any = None) -> None:
            self.state = AppState()
            self.show(LoginScreen)

        if self.session is None:
            back()
            return
        self.run_async(self.session.logout, back, back)

    def reset(self) -> None:
        """Quita la pantalla y el estado (para pruebas que reutilizan la misma ventana)."""
        if self.current is not None:
            old, self.current = self.current, None
            old.on_hide()
            old.destroy()
        self.session = None
        self.config_error = None
        self.state = AppState()
