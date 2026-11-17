"""Inicio: proyectos asignados → turbinas del proyecto → "Importar carpeta WTG"."""
from __future__ import annotations

from tkinter import ttk

from nexus_desktop.nexus.projects import Asset, Project, list_assets, list_projects
from nexus_desktop.ui.screens.base import Screen
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
NO_PENDING = "No hay inspecciones locales pendientes."


class StartScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        self.projects: list[Project] = []
        self.assets: dict[str, Asset] = {}
        self._retry = None

        top = ttk.Frame(self)
        top.pack(fill="x", pady=(0, 16))
        ttk.Label(top, text="Proyecto y turbina", style="Title.TLabel").pack(side="left")
        self.logout_button = ttk.Button(top, text="Cerrar sesión", command=self._logout)
        self.logout_button.pack(side="right")
        self.user_label = ttk.Label(top, text=f"Sesión: {app.session.email or ''}", style="Muted.TLabel")
        self.user_label.pack(side="right", padx=(0, 12))

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
        self.asset_tree.bind("<<TreeviewSelect>>", lambda _e: self._update_import_button())

        status_row = ttk.Frame(panel, style="Panel.TFrame", borderwidth=0, relief="flat")
        status_row.grid(row=4, column=0, sticky="ew")
        self.status_label = ttk.Label(status_row, text="", style="Panel.Muted.TLabel",
                                      wraplength=560, justify="left")
        self.status_label.pack(side="left")
        self.retry_button = ttk.Button(status_row, text="Reintentar", command=self._do_retry)

        self.import_button = ttk.Button(panel, text="Importar carpeta WTG", style="Accent.TButton",
                                        command=self._import)
        self.import_button.grid(row=5, column=0, sticky="e", pady=(12, 0))
        self.import_button.state(["disabled"])

        pending = ttk.Frame(self, style="Panel.TFrame", padding=16)
        # Abajo y antes que el panel principal en el orden de pack: así nunca queda recortado.
        pending.pack(side="bottom", fill="x", pady=(16, 0), before=panel)
        ttk.Label(pending, text="Inspecciones locales pendientes", style="Panel.TLabel").pack(anchor="w")
        items = list(app.pending_local)
        ttk.Label(pending, text="\n".join(items) if items else NO_PENDING,
                  style="Panel.Muted.TLabel", justify="left").pack(anchor="w", pady=(4, 0))

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

    def _update_import_button(self) -> None:
        ready = self._selected_project() is not None and self._selected_asset() is not None
        self.import_button.state(["!disabled"] if ready else ["disabled"])

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

    # --- turbinas ---

    def _project_selected(self) -> None:
        self.asset_tree.delete(*self.asset_tree.get_children())
        self.assets = {}
        self._update_import_button()
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
        previous = self.app.state.asset
        if previous is not None and previous.id in self.assets:
            self.asset_tree.selection_set(previous.id)
        self._update_import_button()

    # --- acciones ---

    def _import(self) -> None:
        from nexus_desktop.ui.screens.import_ import ImportScreen

        project, asset = self._selected_project(), self._selected_asset()
        if project is None or asset is None:
            return
        self.app.state.project, self.app.state.asset = project, asset
        self.app.show(ImportScreen)

    def _logout(self) -> None:
        self.logout_button.state(["disabled"])
        self.import_button.state(["disabled"])
        self._set_status("Cerrando sesión…")
        self.app.logout()
