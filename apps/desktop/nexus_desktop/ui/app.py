"""Ventana principal: cabecera con el logo y una pantalla (Screen) a la vez."""
from __future__ import annotations

import logging
import time
import tkinter as tk
from dataclasses import dataclass, field
from tkinter import messagebox, ttk
from typing import Any, Callable

from nexus_desktop import applog
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
UNEXPECTED_ERROR = ("Ocurrió un error inesperado. Lo ya subido y la carpeta WTG no se pierden; si algo "
                    "no responde, cierra la app y vuelve a abrirla. Si se repite, envía a soporte el "
                    "registro: {path}")

CLOSE_PROMPT = "Hay un proceso en curso. ¿Salir? Lo ya subido queda guardado y podrás reanudar."
CLOSE_WAIT_S = 15  # al salir con un proceso en curso, espera a que termine el archivo actual
CLOSE_POLL_MS = 100

log = logging.getLogger(__name__)


@dataclass
class AppState:
    """Lo elegido y calculado a lo largo del flujo (lo comparten las pantallas)."""
    wtg: WtgFolder | None = None
    project: Project | None = None
    asset: Asset | None = None
    blade_length_m: float | None = None
    # Nombre/etiqueta de la turbina para trabajar sin conexión (sale del nombre de la carpeta y se
    # puede editar); el servidor no interviene hasta la subida (project/asset).
    turbine_name: str = ""
    marks: MarkingState | None = None  # punta y raíz de las secciones de `wtg`
    # Tiras para la subida: {(pala, cara): ruta}; las fija la verificación.
    strips: dict = field(default_factory=dict)
    # Resultado del procesamiento: domain.reconstruction.SectionResult por sección cosida
    # (tira, calibración en píxeles de la tira guardada, radio y GSD de cada foto).
    sections: list = field(default_factory=list)

    def forget_folder(self) -> None:
        """Olvida la carpeta WTG y todo lo calculado sobre ella (marcas, tiras, resultados)."""
        self.wtg, self.marks, self.blade_length_m = None, None, None
        self.turbine_name = ""
        self.strips, self.sections = {}, []
        self.asset = None  # el destino de la próxima carpeta se elige al subirla

    def title_parts(self) -> list[str]:
        """Texto bajo el título de las pantallas: turbina (etiqueta del técnico) y carpeta."""
        parts = [self.turbine_name] if self.turbine_name else []
        if self.wtg is not None and self.wtg.path.name not in parts:
            parts.append(self.wtg.path.name)
        return parts


def create_session() -> tuple[Session | None, str | None]:
    """Crea la sesión con la configuración; si falta algo devuelve (None, mensaje en español)."""
    from nexus_desktop import config

    path = config.user_config_path()
    if config.CONFIG_ERROR:  # URL que falta o insegura: ya es un mensaje en español
        return None, config.CONFIG_ERROR
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
        self._closing = False
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self._build_header()
        self.body = ttk.Frame(self)
        self.body.pack(fill="both", expand=True)
        self.refresh_header()
        if start:
            self.show_initial()

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
        # A la derecha: «Sin conexión» o «Sesión: correo» y el botón para entrar o salir.
        self.session_button = ttk.Button(header, text="Iniciar sesión", command=self._session_button)
        self.session_button.pack(side="right")
        self.connection_label = ttk.Label(header, text="Sin conexión", style="Panel.Muted.TLabel")
        self.connection_label.pack(side="right", padx=(0, 12))

    def show(self, screen_cls: type[Screen], **kwargs: Any) -> Screen:
        """Destruye la pantalla actual y muestra una nueva de `screen_cls`."""
        if self.current is not None:
            old, self.current = self.current, None
            old.on_hide()
            old.destroy()
        screen = screen_cls(self.body, self, **kwargs)
        screen.pack(fill="both", expand=True)
        self.current = screen
        self.refresh_header()
        screen.on_show()
        return screen

    # --- sesión (solo hace falta para subir) ---

    @property
    def logged_in(self) -> bool:
        return self.session is not None and getattr(self.session, "email", None) is not None

    def refresh_header(self) -> None:
        """«Sin conexión» + «Iniciar sesión», o «Sesión: correo» + «Cerrar sesión». Entrar solo se
        ofrece en el Inicio (en medio del trabajo se entra al subir)."""
        from nexus_desktop.ui.screens.start import StartScreen

        if self.logged_in:
            self.connection_label.configure(text=f"Sesión: {self.session.email}")
            self.session_button.configure(text="Cerrar sesión")
            self.session_button.state(["!disabled"])
        else:
            self.connection_label.configure(text="Sin conexión")
            self.session_button.configure(text="Iniciar sesión")
            self.session_button.state(["!disabled"] if isinstance(self.current, StartScreen) else ["disabled"])

    def _session_button(self) -> None:
        if self.logged_in:
            self.logout()
        else:
            self.show_login(next_screen=type(self.current) if self.current is not None else None)

    def show_initial(self) -> None:
        """Pantalla de arranque: el Inicio, sin pedir sesión (el técnico trabaja sin conexión)."""
        from nexus_desktop.ui.screens.start import StartScreen

        self.show(StartScreen)

    def show_login(self, next_screen=None, message: str | None = None, email: str | None = None) -> None:
        from nexus_desktop.ui.screens.login import LoginScreen

        self.show(LoginScreen, message=message, email=email, next_screen=next_screen)

    def show_destination(self) -> None:
        """Camino de la subida: sin sesión, primero el login y luego el destino (proyecto y turbina)."""
        from nexus_desktop.ui.screens.destination import DestinationScreen

        if self.logged_in:
            self.show(DestinationScreen)
        else:
            self.show_login(next_screen=DestinationScreen)

    def run_async(self, fn: Callable[[], Any], on_done: Callable[[Any], None],
                  on_error: Callable[[Exception], None] | None = None) -> None:
        self.tasks.run_async(fn, on_done, on_error)

    def report_callback_exception(self, exc_type, exc, tb) -> None:
        """Error no atrapado en un callback de Tk (o en una tarea sin `on_error`): queda en el
        registro con su traza y el técnico ve un aviso en español, nunca la traza."""
        log.error("Error inesperado en la interfaz", exc_info=(exc_type, exc, tb))
        path = applog.log_path() or applog.default_log_dir() / applog.LOG_FILE
        try:
            messagebox.showerror("NEXUS", UNEXPECTED_ERROR.format(path=path), parent=self)
        except tk.TclError:  # la ventana ya se cerró
            pass

    def busy(self) -> bool:
        """Hay un procesamiento o una subida en curso en la pantalla actual."""
        return bool(getattr(self.current, "running", False))

    def on_close(self) -> None:
        """La «X» de la ventana. Con un proceso en curso pregunta; si se confirma, lo cancela
        (termina el archivo en curso, lo ya subido queda en el índice) y cierra al terminar."""
        if self._closing:
            return
        if self.busy():
            if not messagebox.askyesno("NEXUS", CLOSE_PROMPT, parent=self):
                return
            self._closing = True
            log.info("Cierre pedido con un proceso en curso: se cancela")
            cancel = getattr(self.current, "cancel", None)
            if callable(cancel):
                cancel()
        self._closing = True
        self._close_when_idle(time.monotonic() + CLOSE_WAIT_S)

    def _close_when_idle(self, deadline: float) -> None:
        if self.busy() and time.monotonic() < deadline:
            self.after(CLOSE_POLL_MS, lambda: self._close_when_idle(deadline))
            return
        if self.current is not None:
            self.current.on_hide()
        self.destroy()

    def session_lost(self) -> None:
        """La sesión caducó: vuelve al login y, tras entrar, a donde se estaba (la subida o el
        destino). Se conserva todo lo hecho (el avance de la subida está en el índice local)."""
        from nexus_desktop.ui.screens.destination import DestinationScreen
        from nexus_desktop.ui.screens.start import StartScreen
        from nexus_desktop.ui.screens.upload import UploadScreen

        email = self.session.email if self.session is not None else None
        if self.session is not None:
            self.session.email = None
        if isinstance(self.current, UploadScreen) and self.state.project and self.state.asset:
            target = UploadScreen
        elif isinstance(self.current, (UploadScreen, DestinationScreen)):
            target = DestinationScreen
        else:
            target = StartScreen
        self.show_login(next_screen=target, message=SESSION_EXPIRED, email=email)

    def logout(self) -> None:
        """Cierra la sesión en segundo plano. El trabajo local (carpeta, marcas, tiras) se conserva;
        solo se olvida el destino elegido con la cuenta anterior."""
        from nexus_desktop.ui.screens.destination import DestinationScreen

        if self.busy():
            return

        def back(_result: Any = None) -> None:
            self.state.project = self.state.asset = None
            if isinstance(self.current, DestinationScreen):  # sin sesión no hay destino que elegir
                self.show_login(next_screen=DestinationScreen)
            else:
                self.refresh_header()

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
        self._closing = False
        self.refresh_header()
