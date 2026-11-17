"""Destino de la subida: proyecto y turbina de NEXUS donde se sube la inspección ya procesada.

Solo se muestra al subir (con la sesión iniciada; si no, antes pasa por el login). Las listas salen
del servidor: solo los proyectos y turbinas asignados al técnico (los filtra RLS). La turbina cuyo
nombre coincide con la etiqueta que escribió el técnico al importar se elige sola.
"""
from __future__ import annotations

from tkinter import ttk

from nexus_desktop.nexus.projects import Asset, Project, list_assets, list_projects
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.screens.upload import short_path
from nexus_desktop.ui.theme import TOKENS

STATUS_TEXT = {
    None: "Sin inspección",
    "pending": "Pendiente",
    "captured": "Capturada",
    "processing": "En proceso",
    "in_review": "En revisión",
    "approved": "Aprobada",
}
NO_PROJECTS = "No tienes proyectos asignados."
NO_ASSETS = "Este proyecto no tiene turbinas."
PROJECTS_ERROR = "No se pudieron cargar los proyectos. Revisa la conexión e inténtalo de nuevo."
ASSETS_ERROR = "No se pudieron cargar las turbinas. Revisa la conexión e inténtalo de nuevo."


def _normalized(name: str) -> str:
    return "".join(ch for ch in name.casefold() if ch.isalnum())


class DestinationScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        self.projects: list[Project] = []
        self.assets: dict[str, Asset] = {}
        self._retry = None

        top = ttk.Frame(self)
        top.pack(fill="x", pady=(0, 4))
        ttk.Label(top, text="Destino de la subida", style="Title.TLabel").pack(side="left")
        state = app.state
        detail = " · ".join(state.title_parts())
        if state.wtg is not None:
            detail = f"{detail} — {short_path(state.wtg.path, 70)}" if detail else short_path(state.wtg.path, 70)
        ttk.Label(self, text=f"Se sube: {detail}" if detail else "", style="Muted.TLabel").pack(
            anchor="w", pady=(0, 12))

        footer = ttk.Frame(self)
        footer.pack(side="bottom", fill="x", pady=(16, 0))
        self.back_button = ttk.Button(footer, text="Volver al inicio", command=self._back)
        self.back_button.pack(side="left")
        self.upload_button = ttk.Button(footer, text="Subir", style="Accent.TButton", command=self._upload)
        self.upload_button.pack(side="right")
        self.upload_button.state(["disabled"])

        panel = ttk.Frame(self, style="Panel.TFrame", padding=20)
        panel.pack(fill="both", expand=True)
        panel.columnconfigure(0, weight=1)
        panel.rowconfigure(3, weight=1)

        ttk.Label(panel, text="Proyecto", style="Panel.TLabel").grid(row=0, column=0, sticky="w")
        self.project_combo = ttk.Combobox(panel, state="readonly", width=48)
        self.project_combo.grid(row=1, column=0, sticky="w", pady=(4, 16))
        self.project_combo.bind("<<ComboboxSelected>>", lambda _e: self._project_selected())

        ttk.Label(panel, text="Turbinas", style="Panel.TLabel").grid(row=2, column=0, sticky="w")
        self.asset_tree = ttk.Treeview(panel, columns=("name", "status"), show="headings",
                                       selectmode="browse", height=8)
        self.asset_tree.heading("name", text="Turbina")
        self.asset_tree.heading("status", text="Estado de la inspección")
        self.asset_tree.column("name", width=260)
        self.asset_tree.column("status", width=200)
        self.asset_tree.grid(row=3, column=0, sticky="nsew", pady=(4, 8))
        self.asset_tree.bind("<<TreeviewSelect>>", lambda _e: self._update_upload_button())

        status_row = ttk.Frame(panel, style="Panel.TFrame", borderwidth=0, relief="flat")
        status_row.grid(row=4, column=0, sticky="ew")
        self.status_label = ttk.Label(status_row, text="", style="Panel.Muted.TLabel",
                                      wraplength=560, justify="left")
        self.status_label.pack(side="left")
        self.retry_button = ttk.Button(status_row, text="Reintentar", command=self._do_retry)

    def on_show(self) -> None:
        self._load_projects()

    # --- estado y mensajes ---

    def _set_status(self, text: str, error: bool = False, retry=None) -> None:
        self.status_label.configure(text=text,
                                    foreground=TOKENS["critical"] if error else TOKENS["text_muted"])
        self._retry = retry
        if retry is not None:
            self.retry_button.pack(side="left", padx=(12, 0))
        else:
            self.retry_button.pack_forget()

    def _do_retry(self) -> None:
        if self._retry is not None:
            self._retry()

    def _selected_project(self) -> Project | None:
        index = self.project_combo.current()
        return self.projects[index] if 0 <= index < len(self.projects) else None

    def _selected_asset(self) -> Asset | None:
        sel = self.asset_tree.selection()
        return self.assets.get(sel[0]) if sel else None

    def _update_upload_button(self) -> None:
        ready = self._selected_project() is not None and self._selected_asset() is not None
        self.upload_button.state(["!disabled"] if ready else ["disabled"])

    # --- proyectos ---

    def _load_projects(self) -> None:
        self._set_status("Cargando proyectos…")
        self.project_combo.state(["disabled"])
        session = self.app.session

        def fetch() -> list[Project]:
            session.access_token()  # renueva o lanza SessionLost antes de consultar
            return list_projects(session.client)

        self.run_async(fetch, self._projects_loaded,
                       lambda _e: self._set_status(PROJECTS_ERROR, error=True, retry=self._load_projects))

    def _projects_loaded(self, projects: list[Project]) -> None:
        self.projects = projects
        self.project_combo.configure(values=[p.name for p in projects])
        if not projects:
            self._set_status(NO_PROJECTS)
            return
        self.project_combo.state(["!disabled", "readonly"])
        self._set_status("Elige un proyecto.")
        previous = self.app.state.project
        ids = [p.id for p in projects]
        if previous is not None and previous.id in ids:
            self.project_combo.current(ids.index(previous.id))
            self._project_selected()
        elif len(projects) == 1:  # un solo proyecto asignado: no hay nada que elegir
            self.project_combo.current(0)
            self._project_selected()

    # --- turbinas ---

    def _project_selected(self) -> None:
        self.asset_tree.delete(*self.asset_tree.get_children())
        self.assets = {}
        self._update_upload_button()
        project = self._selected_project()
        if project is not None:
            self._load_assets(project)

    def _load_assets(self, project: Project) -> None:
        self._set_status("Cargando turbinas…")
        session = self.app.session

        def fetch() -> list[Asset]:
            session.access_token()
            return list_assets(session.client, project.id)

        def done(assets: list[Asset]) -> None:
            if self._selected_project() is project:  # descarta respuestas de otro proyecto
                self._assets_loaded(assets)

        def failed(_exc: Exception) -> None:
            if self._selected_project() is project:
                self._set_status(ASSETS_ERROR, error=True, retry=lambda: self._load_assets(project))

        self.run_async(fetch, done, failed)

    def _assets_loaded(self, assets: list[Asset]) -> None:
        self.assets = {a.id: a for a in assets}
        for a in assets:
            status = STATUS_TEXT.get(a.status_hint, "Estado desconocido")
            self.asset_tree.insert("", "end", iid=a.id, values=(a.name, status))
        self._set_status("Elige una turbina." if assets else NO_ASSETS)
        state = self.app.state
        chosen = state.asset if state.asset is not None and state.asset.id in self.assets else None
        if chosen is None and state.turbine_name:  # la etiqueta del técnico coincide con una turbina
            wanted = _normalized(state.turbine_name)
            matches = [a for a in assets if wanted and _normalized(a.name) == wanted]
            chosen = matches[0] if len(matches) == 1 else None
        if chosen is not None:
            self.asset_tree.selection_set(chosen.id)
        self._update_upload_button()

    # --- acciones ---

    def _upload(self) -> None:
        from nexus_desktop.ui.screens.upload import UploadScreen

        project, asset = self._selected_project(), self._selected_asset()
        if project is None or asset is None:
            return
        self.app.state.project, self.app.state.asset = project, asset
        self.app.show(UploadScreen)

    def _back(self) -> None:
        from nexus_desktop.ui.screens.start import StartScreen

        self.app.show(StartScreen)
