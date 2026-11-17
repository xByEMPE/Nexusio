"""Verificación por pala (de `_show_verification_screen` del original).

Mismo flujo: una pala a la vez y cuatro columnas (LE, TE, PS, SS) con las fotos de la punta
(arriba) a la raíz (abajo). En lugar de una miniatura por foto, cada columna muestra la tira con
las marcas de la calibración (punta y raíz) y la lista de fotos con su radio y GSD; al elegir una
foto se marca su centro sobre la tira.

«Terminar» deja las tiras en `app.state.strips` (con `app.state.sections`, que lleva radio y GSD por
foto) y pregunta qué hacer con la inspección: «Subir ahora a NEXUS» (destino, y el login si no hay
sesión) o «Guardar y subir después» (JSON en la carpeta WTG + entrada «Lista para subir» en la lista
local, y vuelta al Inicio para procesar otra carpeta).
"""
from __future__ import annotations

import logging
import re
import tkinter as tk
from tkinter import ttk

from nexus_desktop.domain.reconstruction import SectionResult, stitch_order
from nexus_desktop.domain.wtg_folder import FACES
from nexus_desktop.storage import ready
from nexus_desktop.ui.screens.results import StripGridScreen, decimal
from nexus_desktop.ui import theme
from nexus_desktop.ui.theme import TOKENS

TIP_COLOR = TOKENS["caution"]
ROOT_COLOR = TOKENS["telemetry"]
PHOTO_COLOR = TOKENS["critical"]
SHADOW = "#000000"
log = logging.getLogger(__name__)
FINISH_QUESTION = "¿Qué quieres hacer con esta inspección?"
FINISH_HELP = ("«Subir ahora» pide iniciar sesión (si no la tienes) y elegir proyecto y turbina. «Guardar» "
               "deja la inspección en el Inicio como «Lista para subir»: la subes cuando tengas "
               "conexión, aunque cierres la app, y mientras tanto puedes procesar otra carpeta.")
SAVE_ERROR = "No se pudo guardar la inspección. {cause} Puedes reintentar o subirla ahora."
_DJI_NAME = re.compile(r"^DJI_\d+_(.+)$", re.IGNORECASE)


def short_name(file_name: str) -> str:
    """Etiqueta corta de la foto: DJI_20260429135958_0019_V_E.JPG -> 0019_V_E (cabe en la columna)."""
    stem = file_name.rsplit(".", 1)[0]
    m = _DJI_NAME.match(stem)
    return m.group(1) if m else stem


class VerificationScreen(StripGridScreen):
    TITLE = "Verificación"
    CANVAS_HEIGHT = 200

    def __init__(self, master, app, blade: str | None = None) -> None:
        self.trees: dict[str, ttk.Treeview] = {}
        self._takefocus: dict = {}
        self._escape_id: str | None = None
        self._rows: dict[str, dict[str, str]] = {}  # cara -> {item: nombre de la foto}
        super().__init__(master, app, blade)

    def _build_footer(self, footer: ttk.Frame) -> None:
        self.continue_button = ttk.Button(footer, text="Terminar", style="Accent.TButton",
                                          command=self._continue)
        self.continue_button.pack(side="right")
        self.back_button = ttk.Button(footer, text="Volver a resultados", command=self._back)
        self.back_button.pack(side="right", padx=(0, 8))
        ttk.Label(footer, text="Punta", foreground=TIP_COLOR).pack(side="left")
        ttk.Label(footer, text="Raíz", foreground=ROOT_COLOR).pack(side="left", padx=(12, 0))
        ttk.Label(footer, text="Foto elegida", foreground=PHOTO_COLOR).pack(side="left", padx=(12, 0))
        ttk.Label(footer, text="Radio en m · GSD en mm/px", style="Muted.TLabel").pack(side="left", padx=(16, 0))
        if not self.sections:
            self.continue_button.state(["disabled"])
        self._build_finish_dialog()

    def _build_finish_dialog(self) -> None:
        """La pregunta del final: un panel en el centro de la pantalla (oculto hasta «Terminar»)."""
        self.finish_frame = ttk.Frame(self, style="Panel.TFrame", padding=24, relief="solid", borderwidth=1)
        ttk.Label(self.finish_frame, text=FINISH_QUESTION, style="Panel.TLabel",
                  font=theme.font(13, "bold")).pack(anchor="w")
        ttk.Label(self.finish_frame, text=FINISH_HELP, style="Panel.Muted.TLabel", wraplength=460,
                  justify="left").pack(anchor="w", pady=(8, 14))
        self.finish_error_label = ttk.Label(self.finish_frame, text="", style="Panel.TLabel",
                                            foreground=TOKENS["critical"], wraplength=460, justify="left")
        self.finish_error_label.pack(anchor="w")
        self.upload_now_button = ttk.Button(self.finish_frame, text="Subir ahora a NEXUS",
                                            style="Accent.TButton", command=self._upload_now)
        self.upload_now_button.pack(fill="x", pady=(6, 0))
        self.save_later_button = ttk.Button(self.finish_frame, text="Guardar y subir después",
                                            command=self._save_later)
        self.save_later_button.pack(fill="x", pady=(8, 0))
        self.keep_reviewing_button = ttk.Button(self.finish_frame, text="Seguir revisando",
                                                command=self._hide_finish)
        self.keep_reviewing_button.pack(anchor="e", pady=(12, 0))
        # Teclado: Enter activa el botón enfocado (no siempre el primero) y Escape es «Seguir revisando».
        for button in (self.upload_now_button, self.save_later_button, self.keep_reviewing_button):
            for sequence in ("<Return>", "<KP_Enter>"):
                button.bind(sequence, self._press)

    def _build_column(self, grid: ttk.Frame, col: int, face: str) -> None:
        frame = ttk.Frame(grid, style="Panel.TFrame", borderwidth=0, relief="flat")
        frame.grid(row=3, column=col, sticky="nsew", padx=4, pady=(6, 0))
        grid.rowconfigure(3, weight=1)
        # "file" (nombre completo) va oculto; se ve la etiqueta corta.
        tree = ttk.Treeview(frame, columns=("photo", "radius", "gsd", "file"), show="headings", height=6,
                            selectmode="browse", displaycolumns=("photo", "radius", "gsd"))
        # Encabezados cortos: las columnas son estrechas (4 caras en la ventana).
        for key, title, width, anchor in (("photo", "Foto", 70, "w"), ("radius", "Radio", 60, "e"),
                                          ("gsd", "GSD", 50, "e")):
            tree.heading(key, text=title)
            tree.column(key, width=width, minwidth=40, anchor=anchor, stretch=key == "photo")
        scroll = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        tree.pack(side="left", fill="both", expand=True)
        tree.bind("<<TreeviewSelect>>", lambda _e, f=face: self._photo_selected(f))
        self.trees[face] = tree

    # --- pala ---

    def _blade_changed(self) -> None:
        for face in FACES:
            tree = self.trees[face]
            tree.delete(*tree.get_children())
            self._rows[face] = {}
            section = self.section(face)
            if section is None:
                continue
            # punta arriba: el mismo orden en que se cosió la tira
            for idx in stitch_order(face, len(section.photos)):
                photo = section.photos[idx]
                item = tree.insert("", "end", values=(
                    short_name(photo.path.name),
                    decimal(photo.radius_m) if photo.radius_m is not None else "—",
                    decimal(photo.gsd_mm_px) if photo.gsd_mm_px is not None else "—",
                    photo.path.name,
                ))
                self._rows[face][item] = photo.path.name

    def _info_text(self, section: SectionResult) -> str:
        text = super()._info_text(section)
        cal = section.calibration or {}
        if cal.get("mm_per_px"):
            text += (f"\nPunta: fila {cal['tip_row_px']} · Raíz: fila {cal['root_row_px']}"
                     f" · {decimal(cal['mm_per_px'])} mm/px")
        else:
            text += "\nSin calibración (falta la punta o la raíz)"
        return text

    # --- dibujo sobre la tira ---

    def _row_y(self, face: str, row: float) -> float:
        fit = self.fits[face]
        return row * fit.scale + fit.offset_y

    def _hline(self, face: str, row: float, color: str, tags: tuple[str, ...]) -> None:
        canvas, fit = self.canvases[face], self.fits[face]
        y = self._row_y(face, row)
        x0, x1 = fit.offset_x - 6, fit.offset_x + fit.width + 6
        canvas.create_line(x0, y, x1, y, fill=SHADOW, width=4, tags=tags)
        canvas.create_line(x0, y, x1, y, fill=color, width=2, tags=tags)

    def _decorate(self, face: str) -> None:
        section = self.section(face)
        cal = section.calibration or {}
        if cal.get("tip_row_px") is not None:
            self._hline(face, cal["tip_row_px"], TIP_COLOR, ("calibration", "tip_line"))
        if cal.get("root_row_px") is not None:
            self._hline(face, cal["root_row_px"], ROOT_COLOR, ("calibration", "root_line"))
        self._photo_selected(face)

    def _photo_selected(self, face: str) -> None:
        canvas = self.canvases[face]
        canvas.delete("photo")
        section, tree = self.section(face), self.trees[face]
        if section is None or face not in self.fits or not tree.selection():
            return
        name = self._rows[face].get(tree.selection()[0])
        chord = section.chord or {}
        names = chord.get("photos") or []
        if name not in names:  # foto descartada por el cosedor (dron flotando): no está en la tira
            return
        center = chord["image_centers"][names.index(name)]
        row = center["center_y_global"] * chord.get("scale_to_strip", 1.0)
        self._hline(face, row, PHOTO_COLOR, ("photo",))

    # --- navegación ---

    def _back(self) -> None:
        from nexus_desktop.ui.screens.results import ResultsScreen

        self.app.show(ResultsScreen, blade=self.blade)

    def _continue(self) -> None:
        """«Terminar»: deja las tiras listas para la subida y pregunta qué hacer."""
        state = self.app.state
        if not state.sections:
            return
        state.strips = {(s.blade, s.face): s.strip_path for s in state.sections}
        self._show_finish()

    def _show_finish(self) -> None:
        self.finish_error_label.configure(text="")
        self.finish_frame.place(relx=0.5, rely=0.5, anchor="center")
        self.finish_frame.lift()
        for button in (self.continue_button, self.back_button):
            button.state(["disabled"])
        self._lock_background()
        if self._escape_id is None:
            self._escape_id = self.winfo_toplevel().bind("<Escape>", self._escape, add="+")
        self.upload_now_button.focus_set()

    def _lock_background(self) -> None:
        """Modal para el teclado: mientras el panel está abierto, nada de lo de detrás recibe foco con
        Tab (Tk no tiene grab para un Frame). Se restauran al cerrar el panel."""
        inside = str(self.finish_frame)
        stack = list(self.winfo_children())
        while stack:
            widget = stack.pop()
            if str(widget).startswith(inside):
                continue
            stack.extend(widget.winfo_children())
            try:
                self._takefocus[widget] = widget.cget("takefocus")
                widget.configure(takefocus=0)
            except tk.TclError:
                self._takefocus.pop(widget, None)

    def _unlock_background(self) -> None:
        for widget, value in self._takefocus.items():
            try:
                widget.configure(takefocus=value)
            except tk.TclError:
                pass
        self._takefocus.clear()
        if self._escape_id is not None:
            self.winfo_toplevel().unbind("<Escape>", self._escape_id)
            self._escape_id = None

    def _press(self, event) -> str:
        event.widget.invoke()
        return "break"

    def _escape(self, _event=None) -> str | None:
        if self.finish_frame.winfo_manager() == "":
            return None
        self._hide_finish()
        return "break"

    def on_hide(self) -> None:
        self._unlock_background()
        super().on_hide()

    def _hide_finish(self) -> None:
        self._unlock_background()
        self.finish_frame.place_forget()
        self.continue_button.state(["!disabled"])
        self.back_button.state(["!disabled"])

    def _upload_now(self) -> None:
        """Subir ahora: destino de la subida (con el login antes si no hay sesión). Por si se cierra
        la app a medias, lo procesado queda guardado en la carpeta y en la lista local."""
        try:
            ready.register_ready(self.app.state, keep_existing=True)
        except ready.SAVE_ERRORS as exc:  # la lista es una ayuda: subir ahora no depende de ella
            log.warning("No se pudo guardar la inspección antes de subir (%s)", type(exc).__name__)
        self.app.show_destination()

    def _save_later(self) -> None:
        """Guardar y subir después: JSON en la carpeta + «Lista para subir» en la lista local."""
        from nexus_desktop.ui.screens.start import StartScreen

        try:
            ready.register_ready(self.app.state)
        except ready.SAVE_ERRORS as exc:
            log.warning("No se pudo guardar la inspección para subirla después (%s)", type(exc).__name__)
            self.finish_error_label.configure(text=SAVE_ERROR.format(cause=ready.save_error_text(exc)))
            return
        self.app.state.forget_folder()  # lista para procesar otra carpeta; lo guardado no se toca
        self.app.show(StartScreen)
