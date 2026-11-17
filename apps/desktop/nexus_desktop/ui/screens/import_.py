"""Importación: elegir la carpeta WTG → leerla (scan_wtg, en segundo plano) → palas y caras
encontradas, lo que falta y la foto _ID → longitud de pala (m) → marcado de punta y raíz.

Viene de `_show_import_dialog` del original, sin parque/número de WTG/modelo (ya los da el
proyecto y la turbina elegidos) y sin mover carpetas: `scan_wtg` ya reconoce la
estructura plana, así que la carpeta del técnico no se toca.
"""
from __future__ import annotations

import math
from pathlib import Path
from tkinter import filedialog, ttk

from PIL import ImageTk

from nexus_desktop.domain.marking import MarkingState
from nexus_desktop.domain.wtg_folder import BLADES, FACES, WtgFolder, scan_wtg
from nexus_desktop.ui import thumbnails
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.theme import TOKENS

CHOOSE_FOLDER = "Elige la carpeta de la inspección de la turbina (WTG)."
READING = "Leyendo la carpeta…"
READ_ERROR = "No se pudo leer la carpeta. Comprueba que existe y que tienes permiso para abrirla."
NO_SECTIONS = ("No se encontraron fotos de palas en esta carpeta. Debe tener carpetas "
               "Blade A/B/C (o Pala A/B/C) con las caras LE, TE, PS y SS.")
NO_ID_PHOTO = "No se encontró la foto _ID en la carpeta."
MIN_BLADE_LENGTH_M, MAX_BLADE_LENGTH_M = 5.0, 150.0
INVALID_LENGTH = "Escribe la longitud de la pala en metros, entre 5 y 150 (por ejemplo 61,5)."
OUT_OF_RANGE_LENGTH = ("La longitud de la pala debe estar entre 5 y 150 m y escribiste {text} m: revisa "
                       "que no sobre ni falte una cifra (escala todos los radios y las medidas).")
ID_PREVIEW_SIDE = 220


def _parse_number(text: str) -> float | None:
    """Número finito y positivo, con coma o punto decimal; si no, None."""
    value = text.strip().replace(",", ".")
    if not value or value.count(".") > 1 or not all(c.isdigit() or c == "." for c in value):
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) and number > 0 else None


def parse_blade_length(text: str) -> float | None:
    """Longitud de pala en metros (5-150 m, con coma o punto decimal); si no, None."""
    number = _parse_number(text)
    return number if number is not None and MIN_BLADE_LENGTH_M <= number <= MAX_BLADE_LENGTH_M else None


def length_error(text: str) -> str:
    """Mensaje para lo escrito en la longitud ("" si está vacío o es válido)."""
    if not text.strip() or parse_blade_length(text) is not None:
        return ""
    if _parse_number(text) is not None:
        return OUT_OF_RANGE_LENGTH.format(text=text.strip())
    return INVALID_LENGTH


def _typing_allowed(proposed: str) -> bool:
    """Validación por tecla del original: solo dígitos y un separador decimal."""
    return all(c in "0123456789.," for c in proposed) and proposed.count(".") + proposed.count(",") <= 1


def format_missing(missing: list[str]) -> str:
    """'A/PS, A/SS; pala C completa' a partir de WtgFolder.missing."""
    by_blade: dict[str, list[str]] = {}
    for code in missing:
        blade, face = code.split("/")
        by_blade.setdefault(blade, []).append(face)
    parts = []
    for blade in BLADES:
        faces = by_blade.get(blade, [])
        if len(faces) == len(FACES):
            parts.append(f"pala {blade} completa")
        elif faces:
            parts.append(", ".join(f"{blade}/{f}" for f in faces))
    return "; ".join(parts)


def _format_length(value: float) -> str:
    return f"{value:g}".replace(".", ",")


class ImportScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        self.wtg: WtgFolder | None = None
        self.id_photo: ImageTk.PhotoImage | None = None
        self._gen = 0  # descarta lecturas de una carpeta elegida antes

        state = app.state
        ttk.Label(self, text="Importar carpeta WTG", style="Title.TLabel").pack(anchor="w")
        if state.project is not None and state.asset is not None:
            ttk.Label(self, text=f"{state.project.name} · {state.asset.name}",
                      style="Muted.TLabel").pack(anchor="w", pady=(4, 0))

        footer = ttk.Frame(self)
        footer.pack(side="bottom", fill="x", pady=(16, 0))
        self.back_button = ttk.Button(footer, text="Volver", command=self._back)
        self.back_button.pack(side="left")
        self.continue_button = ttk.Button(footer, text="Continuar al marcado", style="Accent.TButton",
                                          command=self._continue)
        self.continue_button.pack(side="right")
        self.continue_button.state(["disabled"])

        panel = ttk.Frame(self, style="Panel.TFrame", padding=20)
        panel.pack(fill="both", expand=True, pady=(16, 0))
        panel.columnconfigure(0, weight=1)

        form = ttk.Frame(panel, style="Panel.TFrame", borderwidth=0, relief="flat")
        form.grid(row=0, column=0, sticky="nsew")
        form.columnconfigure(0, weight=1)

        ttk.Label(form, text="Carpeta de la inspección", style="Panel.TLabel").grid(
            row=0, column=0, columnspan=2, sticky="w")
        self.folder_label = ttk.Label(form, text="Ninguna carpeta elegida", style="Panel.TLabel",
                                      wraplength=480, justify="left")
        self.folder_label.grid(row=1, column=0, sticky="ew", pady=(4, 0))
        self.browse_button = ttk.Button(form, text="Elegir carpeta…", command=self._browse)
        self.browse_button.grid(row=1, column=1, sticky="e", padx=(8, 0), pady=(4, 0))

        self.status_label = ttk.Label(form, text=CHOOSE_FOLDER, style="Panel.Muted.TLabel",
                                      wraplength=560, justify="left")
        self.status_label.grid(row=2, column=0, columnspan=2, sticky="w", pady=(8, 8))

        self.summary_tree = ttk.Treeview(form, columns=("blade", *FACES), show="headings",
                                         selectmode="none", height=len(BLADES))
        self.summary_tree.heading("blade", text="Pala")
        self.summary_tree.column("blade", width=110, anchor="w")
        for face in FACES:
            self.summary_tree.heading(face, text=face)
            self.summary_tree.column(face, width=70, anchor="center")
        self.summary_tree.grid(row=3, column=0, columnspan=2, sticky="ew")
        ttk.Label(form, text="Número de fotos por cara («—»: no hay).", style="Panel.Muted.TLabel").grid(
            row=4, column=0, columnspan=2, sticky="w", pady=(4, 0))

        self.missing_label = ttk.Label(form, text="", style="Panel.TLabel", wraplength=560,
                                       justify="left", foreground=TOKENS["caution"])
        self.missing_label.grid(row=5, column=0, columnspan=2, sticky="w", pady=(8, 0))

        ttk.Label(form, text="Longitud de pala (m)", style="Panel.TLabel").grid(
            row=6, column=0, columnspan=2, sticky="w", pady=(16, 0))
        # Sin StringVar: una variable Tk que el recolector libere en un hilo de trabajo bloquea
        # Tcl. Los cambios del texto se detectan en la validación por tecla.
        self.length_entry = ttk.Entry(form, width=14, validate="key",
                                      validatecommand=(self.register(self._length_typed), "%P"))
        self.length_entry.grid(row=7, column=0, sticky="w", pady=(4, 0))
        self.length_error = ttk.Label(form, text="", style="Panel.TLabel", wraplength=560,
                                      justify="left", foreground=TOKENS["critical"])
        self.length_error.grid(row=8, column=0, columnspan=2, sticky="w", pady=(4, 0))
        if state.blade_length_m:
            self.length_entry.insert(0, _format_length(state.blade_length_m))
        self.length_entry.bind("<Return>", lambda _e: self._continue())

        side = ttk.Frame(panel, style="Panel.TFrame", borderwidth=0, relief="flat")
        side.grid(row=0, column=1, sticky="n", padx=(24, 0))
        ttk.Label(side, text="Foto de identificación (_ID)", style="Panel.TLabel").pack(anchor="w")
        self.id_image_label = ttk.Label(side, style="Panel.TLabel")
        self.id_image_label.pack(anchor="w", pady=(6, 4))
        self.id_label = ttk.Label(side, text="—", style="Panel.Muted.TLabel", wraplength=ID_PREVIEW_SIDE,
                                  justify="left")
        self.id_label.pack(anchor="w")

    def on_show(self) -> None:
        if self.app.state.wtg is not None:  # se vuelve del marcado: misma carpeta, sin releer
            self.folder_label.configure(text=str(self.app.state.wtg.path))
            self._show_wtg(self.app.state.wtg)
        else:
            self.browse_button.focus_set()

    def on_hide(self) -> None:
        # La imagen Tk se libera aquí, en el hilo de Tk (ver MarkingScreen.on_hide).
        self.id_image_label.configure(image="")
        self.id_photo = None

    def _length_typed(self, proposed: str) -> bool:
        if not _typing_allowed(proposed):
            return False
        # Tras la tecla el texto nuevo ya estará en el campo (si la pantalla sigue viva).
        self.after_idle(lambda: self.winfo_exists() and self._update_continue())
        return True

    # --- carpeta ---

    def _browse(self) -> None:
        path = filedialog.askdirectory(parent=self, title="Elige la carpeta WTG", mustexist=True)
        if path:
            self.load_folder(Path(path))

    def load_folder(self, path: Path) -> None:
        """Lee la carpeta en segundo plano (también lo usan las pruebas, sin diálogo)."""
        path = Path(path)
        self._gen += 1
        gen = self._gen
        self.wtg = None
        self.folder_label.configure(text=str(path))
        self._set_status(READING)
        self.summary_tree.delete(*self.summary_tree.get_children())
        self.missing_label.configure(text="")
        self._clear_id()
        self._update_continue()

        def done(wtg: WtgFolder) -> None:
            if gen == self._gen:
                self._show_wtg(wtg)

        def failed(_exc: Exception) -> None:
            if gen == self._gen:
                self._set_status(READ_ERROR, error=True)

        self.run_async(lambda: scan_wtg(path), done, failed)

    def _show_wtg(self, wtg: WtgFolder) -> None:
        self.wtg = wtg
        self.summary_tree.delete(*self.summary_tree.get_children())
        for blade in BLADES:
            faces = wtg.blades.get(blade, {})
            counts = [str(len(faces[f])) if faces.get(f) else "—" for f in FACES]
            self.summary_tree.insert("", "end", values=(f"Pala {blade}", *counts))

        sections = sum(1 for faces in wtg.blades.values() for f in faces.values() if f)
        photos = sum(len(f) for faces in wtg.blades.values() for f in faces.values())
        if not sections:
            self._set_status(NO_SECTIONS, error=True)
            self.missing_label.configure(text="")
        else:
            self._set_status(f"Carpeta leída: {sections} secciones con {photos} fotos.")
            missing = format_missing(wtg.missing)
            self.missing_label.configure(
                text=(f"Faltan secciones: {missing}. Puedes continuar: solo se marcarán y "
                      "procesarán las secciones presentes.") if missing else "")
        self._show_id(wtg)
        self._update_continue()

    def _clear_id(self) -> None:
        self.id_photo = None
        self.id_image_label.configure(image="")
        self.id_label.configure(text="—", foreground=TOKENS["text_muted"])

    def _show_id(self, wtg: WtgFolder) -> None:
        self._clear_id()
        if wtg.id_photo is None:
            self.id_label.configure(text=NO_ID_PHOTO, foreground=TOKENS["caution"])
            return
        self.id_label.configure(text=wtg.id_photo.name, foreground=TOKENS["text_muted"])
        gen, path = self._gen, wtg.id_photo

        def load():
            shown = thumbnails.load_display(path, thumbnails.cache_dir())
            image = shown.image.copy()
            image.thumbnail((ID_PREVIEW_SIDE, ID_PREVIEW_SIDE))
            return image

        def done(image) -> None:
            if gen == self._gen and self.wtg is wtg:
                self.id_photo = ImageTk.PhotoImage(image, master=self)
                self.id_image_label.configure(image=self.id_photo)

        def failed(_exc: Exception) -> None:
            if gen == self._gen and self.wtg is wtg:
                self.id_label.configure(text=f"{path.name} (no se pudo abrir la foto)",
                                        foreground=TOKENS["caution"])

        self.run_async(load, done, failed)

    # --- estado ---

    def _set_status(self, text: str, error: bool = False) -> None:
        self.status_label.configure(text=text,
                                    foreground=TOKENS["critical"] if error else TOKENS["text_muted"])

    def _has_sections(self) -> bool:
        return self.wtg is not None and any(f for faces in self.wtg.blades.values() for f in faces.values())

    def _update_continue(self) -> None:
        text = self.length_entry.get()
        length = parse_blade_length(text)
        self.length_error.configure(text=length_error(text))
        ready = self._has_sections() and length is not None
        self.continue_button.state(["!disabled"] if ready else ["disabled"])

    # --- acciones ---

    def _continue(self) -> None:
        from nexus_desktop.ui.screens.marking import MarkingScreen

        length = parse_blade_length(self.length_entry.get())
        if not self._has_sections() or length is None:
            self._update_continue()
            return
        state = self.app.state
        if state.wtg is not self.wtg or state.marks is None:  # carpeta nueva: marcas nuevas
            state.wtg = self.wtg
            state.marks = MarkingState(self.wtg.blades)
            state.strips, state.sections = {}, []
        state.blade_length_m = length
        self.app.show(MarkingScreen)

    def _back(self) -> None:
        from nexus_desktop.ui.screens.start import StartScreen

        self.app.show(StartScreen)
