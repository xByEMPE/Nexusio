"""Inicio (sin sesión): «Importar carpeta WTG» y la lista de inspecciones locales.

El técnico trabaja sin conexión: importa, marca, procesa y verifica sin iniciar sesión. La sesión,
el proyecto y la turbina de NEXUS solo hacen falta al subir (pantalla «Destino de la subida»).
La lista muestra las inspecciones «Listas para subir» (guardadas al terminar el procesado) y las
subidas a medias; «Subir» las reconstruye desde el archivo de su carpeta y sigue por el destino.
«Quitar de la lista» solo borra la entrada: nunca toca las fotos, las tiras ni el JSON del técnico.
"""
from __future__ import annotations

from pathlib import Path
from tkinter import ttk

from nexus_desktop.storage import pending, ready
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.screens.upload import short_path
from nexus_desktop.ui.theme import TOKENS

NO_PENDING = "No hay inspecciones locales pendientes."
INTRO = ("Trabaja sin conexión: importa la carpeta de una turbina, márcala y procésala. "
         "Iniciar sesión solo hace falta para subir los resultados a NEXUS.")
LOADING = "Preparando la inspección guardada…"
LOAD_ERROR = "No se pudo leer la inspección guardada. Abre la carpeta de nuevo con «Importar carpeta WTG»."
LIST_ERROR = "No se pudo actualizar la lista de inspecciones pendientes."
PATH_LIMIT = 44  # caracteres de la ruta que caben en la columna «Carpeta»


class StartScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        self._pending_rows: dict[str, str] = {}
        self._gen = 0  # descarta lecturas de una inspección elegida antes

        ttk.Label(self, text="Inicio", style="Title.TLabel").pack(anchor="w")

        panel = ttk.Frame(self, style="Panel.TFrame", padding=20)
        panel.pack(fill="x", pady=(16, 0))
        ttk.Label(panel, text=INTRO, style="Panel.Muted.TLabel", wraplength=720, justify="left").pack(
            anchor="w")
        self.import_button = ttk.Button(panel, text="Importar carpeta WTG", style="Accent.TButton",
                                        command=self._import)
        self.import_button.pack(anchor="w", pady=(16, 0))

        box = ttk.Frame(self, style="Panel.TFrame", padding=16)
        box.pack(fill="both", expand=True, pady=(16, 0))
        head = ttk.Frame(box, style="Panel.TFrame", borderwidth=0, relief="flat")
        head.pack(fill="x")
        ttk.Label(head, text="Inspecciones locales pendientes", style="Panel.TLabel").pack(side="left")
        self.upload_pending_button = ttk.Button(head, text="Subir", style="Accent.TButton",
                                                command=self._upload_pending)
        self.remove_pending_button = ttk.Button(head, text="Quitar de la lista", command=self._remove_pending)
        # Inspección procesada en esta sesión que aún no se subió (p. ej. se volvió desde el destino).
        self.resume_button = ttk.Button(head, text="Continuar la subida", command=self._resume_upload)
        if self._can_resume():
            self.resume_button.configure(text=f"Continuar la subida de {self._resume_name()}")
            self.resume_button.pack(side="right", padx=(8, 0))
        self.no_pending_label = ttk.Label(box, text=NO_PENDING, style="Panel.Muted.TLabel")
        self.pending_tree = ttk.Treeview(box, columns=("folder", "inspection", "status"), show="headings",
                                         selectmode="browse", height=5)
        for key, title, width in (("folder", "Carpeta", 380), ("inspection", "Turbina / destino", 240),
                                  ("status", "Estado", 200)):
            self.pending_tree.heading(key, text=title)
            self.pending_tree.column(key, width=width, anchor="w", stretch=key == "folder")
        self.pending_tree.bind("<<TreeviewSelect>>", lambda _e: self._update_buttons())
        self.status_label = ttk.Label(box, text="", style="Panel.Muted.TLabel", wraplength=720, justify="left")
        self.status_label.pack(side="bottom", anchor="w", pady=(8, 0))
        self._fill_pending()

    # --- inspección procesada en memoria ---

    def _can_resume(self) -> bool:
        s = self.app.state
        return bool(s.wtg is not None and s.sections)

    def _resume_name(self) -> str:
        s = self.app.state
        return s.turbine_name or s.wtg.path.name

    def _resume_upload(self) -> None:
        if self._can_resume():
            self.app.show_destination()

    # --- lista de pendientes ---

    def _fill_pending(self) -> None:
        tree = self.pending_tree
        tree.delete(*tree.get_children())
        self._pending_rows = {}
        items = pending.load()
        for entry in items:
            label = " · ".join(x for x in (entry.project, entry.asset) if x)
            item = tree.insert("", "end", values=(short_path(Path(entry.folder), PATH_LIMIT), label,
                                                  pending.status_text(entry.status)))
            self._pending_rows[item] = entry.folder
        if items:
            self.no_pending_label.pack_forget()
            tree.pack(fill="x", pady=(6, 0))
            self.remove_pending_button.pack(side="right", padx=(8, 0))
            self.upload_pending_button.pack(side="right", padx=(8, 0))
        else:
            tree.pack_forget()
            self.remove_pending_button.pack_forget()
            self.upload_pending_button.pack_forget()
            self.no_pending_label.pack(anchor="w", pady=(4, 0))
        self._update_buttons()

    def _selected_folder(self) -> str | None:
        sel = self.pending_tree.selection()
        return self._pending_rows.get(sel[0]) if sel else None

    def _update_buttons(self) -> None:
        flag = ["!disabled"] if self.pending_tree.selection() else ["disabled"]
        self.remove_pending_button.state(flag)
        self.upload_pending_button.state(flag)

    def _set_status(self, text: str, error: bool = False) -> None:
        self.status_label.configure(text=text,
                                    foreground=TOKENS["critical"] if error else TOKENS["text_muted"])

    def _remove_pending(self) -> None:
        folder = self._selected_folder()
        if folder is None:
            return
        try:
            pending.remove(folder)
        except OSError:
            self._set_status(LIST_ERROR, error=True)
            return
        self._set_status("")
        self._fill_pending()

    def _upload_pending(self) -> None:
        """«Subir» una entrada de la lista: se reconstruye el estado desde el JSON de su carpeta
        (validado) y se sigue por el destino; sin sesión, antes el login."""
        folder = self._selected_folder()
        if folder is None:
            return
        state = self.app.state
        if state.wtg is not None and state.sections and _same(state.wtg.path, folder):
            self.app.show_destination()  # es la que está en memoria: se conserva tal cual
            return
        self._gen += 1
        gen = self._gen
        self.upload_pending_button.state(["disabled"])
        self._set_status(LOADING)

        def done(loaded: ready.ReadyInspection) -> None:
            if gen != self._gen:
                return
            self._guard_current()
            new = loaded.to_state()
            new.project = self.app.state.project  # el proyecto elegido antes se ofrece de nuevo
            self.app.state = new
            self.app.show_destination()

        def failed(exc: Exception) -> None:
            if gen != self._gen:
                return
            self._update_buttons()
            self._set_status(str(exc) if isinstance(exc, ready.ReadyError) else LOAD_ERROR, error=True)

        self.run_async(lambda: ready.load_ready(Path(folder)), done, failed)

    # --- acciones ---

    def _guard_current(self) -> None:
        """Antes de reemplazar lo que hay en memoria, lo ya procesado se guarda en su carpeta (y
        queda en la lista): así no se pierde el trabajo de marcar y procesar."""
        state = self.app.state
        if state.wtg is not None and state.sections and state.blade_length_m:
            ready.register_ready(state, keep_existing=True)

    def _import(self) -> None:
        from nexus_desktop.ui.screens.import_ import ImportScreen

        self._guard_current()
        self.app.state.forget_folder()  # carpeta nueva: marcas y tiras nuevas
        self.app.show(ImportScreen)


def _same(a, b) -> bool:
    import os

    return os.path.normcase(os.path.normpath(str(a))) == os.path.normcase(os.path.normpath(str(b)))
