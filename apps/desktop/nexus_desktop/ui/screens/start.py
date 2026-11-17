"""Inicio (sin sesión): «Importar carpeta WTG» y la lista de inspecciones locales.

El técnico trabaja sin conexión: importa, marca, procesa y verifica sin iniciar sesión. La sesión,
el proyecto y la turbina de NEXUS solo hacen falta al subir (pantalla «Destino de la subida»).
La lista muestra las inspecciones «Listas para subir» (guardadas al terminar el procesado) y las
subidas a medias; «Subir» las reconstruye desde el archivo de su carpeta y sigue por el destino.
«Quitar de la lista» solo borra la entrada: nunca toca las fotos, las tiras ni el JSON del técnico.
"""
from __future__ import annotations

import logging
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
NO_DATA = "Sin datos guardados: vuelve a importar la carpeta"
SAVE_FAILED = "No se pudo guardar el trabajo actual."
log = logging.getLogger(__name__)
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
        # Entradas anteriores a «Guardar y subir después»: no tienen JSON, así que no se pueden subir.
        self.reimport_button = ttk.Button(head, text="Abrir carpeta para reimportar", command=self._reimport)
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
        # Confirmación cuando no se pudo guardar lo procesado y se va a cambiar de carpeta.
        self._on_discard = None
        self._no_data: set[str] = set()
        self.confirm_row = ttk.Frame(box, style="Panel.TFrame")
        self.discard_button = ttk.Button(self.confirm_row, text="Descartar y continuar",
                                         style="Danger.TButton", command=self._discard)
        self.discard_button.pack(side="left")
        self.cancel_button = ttk.Button(self.confirm_row, text="Cancelar", command=self._cancel_discard)
        self.cancel_button.pack(side="left", padx=(8, 0))
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
        self._no_data = set()
        items = pending.load()
        for entry in items:
            label = " · ".join(x for x in (entry.project, entry.asset) if x)
            has_data = ready.find_file(Path(entry.folder)) is not None
            status = pending.status_text(entry.status) if has_data else NO_DATA  # sin JSON no se puede subir
            item = tree.insert("", "end", values=(short_path(Path(entry.folder), PATH_LIMIT), label, status))
            self._pending_rows[item] = entry.folder
            if not has_data:
                self._no_data.add(item)
        buttons = (self.remove_pending_button, self.reimport_button, self.upload_pending_button)
        for button in buttons:
            button.pack_forget()
        if items:
            self.no_pending_label.pack_forget()
            tree.pack(fill="x", pady=(6, 0))
            for button in buttons:
                button.pack(side="right", padx=(8, 0))
        else:
            tree.pack_forget()
            self.no_pending_label.pack(anchor="w", pady=(4, 0))
        self._update_buttons()

    def _selected_item(self) -> str | None:
        sel = self.pending_tree.selection()
        return sel[0] if sel else None

    def _selected_folder(self) -> str | None:
        item = self._selected_item()
        return self._pending_rows.get(item) if item else None

    def _update_buttons(self) -> None:
        item = self._selected_item()
        busy = self.confirm_row.winfo_manager() != ""  # esperando «Descartar y continuar» / «Cancelar»
        selected = item is not None and not busy
        has_data = selected and item not in self._no_data
        self.remove_pending_button.state(["!disabled"] if selected else ["disabled"])
        self.upload_pending_button.state(["!disabled"] if has_data else ["disabled"])
        self.reimport_button.state(["!disabled"] if selected and not has_data else ["disabled"])
        self.import_button.state(["disabled"] if busy else ["!disabled"])

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
        if folder is None or self._selected_item() in self._no_data:
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

            def proceed() -> None:
                new = loaded.to_state()
                new.project = self.app.state.project  # el proyecto elegido antes se ofrece de nuevo
                self.app.state = new
                self.app.show_destination()

            self._guard_current(proceed)

        def failed(exc: Exception) -> None:
            if gen != self._gen:
                return
            self._update_buttons()
            self._set_status(str(exc) if isinstance(exc, ready.ReadyError) else LOAD_ERROR, error=True)

        self.run_async(lambda: ready.load_ready(Path(folder)), done, failed)

    def _reimport(self) -> None:
        """Entrada sin datos guardados: abre su carpeta en «Importar» para marcarla y procesarla otra vez."""
        from nexus_desktop.ui.screens.import_ import ImportScreen

        folder = self._selected_folder()
        if folder is None:
            return
        path = Path(folder)
        if not path.is_dir():
            self._set_status(f"La carpeta {path.name} ya no existe: no se puede reimportar. "
                             "Puedes quitarla de la lista.", error=True)
            return

        def proceed() -> None:
            self.app.state.forget_folder()
            screen = self.app.show(ImportScreen)
            screen.load_folder(path)

        self._guard_current(proceed)

    # --- acciones ---

    def _guard_current(self, proceed) -> None:
        """Antes de reemplazar lo que hay en memoria, lo ya procesado se guarda en su carpeta (y
        queda en la lista): así no se pierde el trabajo de marcar y procesar. Si no se puede guardar
        (disco lleno, carpeta de solo lectura, datos no válidos) NO se continúa sin que el técnico
        lo confirme: «Descartar y continuar» o «Cancelar»."""
        state = self.app.state
        if not (state.wtg is not None and state.sections and state.blade_length_m):
            proceed()
            return
        try:
            ready.register_ready(state, keep_existing=True)
        except ready.SAVE_ERRORS as exc:
            log.warning("No se pudo guardar la inspección antes de cambiar de carpeta (%s)", type(exc).__name__)
            self._ask_discard(f"{SAVE_FAILED} {ready.save_error_text(exc)}", proceed)
            return
        proceed()

    def _ask_discard(self, message: str, proceed) -> None:
        self._on_discard = proceed
        self._set_status(f"{message} ¿Descartar lo procesado y continuar, o cancelar?", error=True)
        self.confirm_row.pack(side="bottom", anchor="w", pady=(8, 0), before=self.status_label)
        self._update_buttons()
        self.cancel_button.focus_set()

    def _hide_confirm(self) -> None:
        self.confirm_row.pack_forget()
        self._on_discard = None
        self._update_buttons()

    def _discard(self) -> None:
        proceed = self._on_discard
        self._hide_confirm()
        self._set_status("")
        if proceed is not None:
            proceed()

    def _cancel_discard(self) -> None:
        self._hide_confirm()
        self._set_status("")

    def _import(self) -> None:
        from nexus_desktop.ui.screens.import_ import ImportScreen

        def proceed() -> None:
            self.app.state.forget_folder()  # carpeta nueva: marcas y tiras nuevas
            self.app.show(ImportScreen)

        self._guard_current(proceed)


def _same(a, b) -> bool:
    import os

    return os.path.normcase(os.path.normpath(str(a))) == os.path.normcase(os.path.normpath(str(b)))
