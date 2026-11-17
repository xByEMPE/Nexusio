"""Verificación por pala (de `_show_verification_screen` del original).

Mismo flujo: una pala a la vez y cuatro columnas (LE, TE, PS, SS) con las fotos de la punta
(arriba) a la raíz (abajo). En lugar de una miniatura por foto, cada columna muestra la tira con
las marcas de la calibración (punta y raíz) y la lista de fotos con su radio y GSD; al elegir una
foto se marca su centro sobre la tira. «Continuar a la subida» deja las tiras en
`app.state.strips` (con `app.state.sections`, que lleva radio y GSD por foto) para la subida.
"""
from __future__ import annotations

from tkinter import ttk

from nexus_desktop.domain.reconstruction import SectionResult, stitch_order
from nexus_desktop.domain.wtg_folder import FACES
from nexus_desktop.ui.screens.results import StripGridScreen, decimal
from nexus_desktop.ui.theme import TOKENS

TIP_COLOR = TOKENS["caution"]
ROOT_COLOR = TOKENS["telemetry"]
PHOTO_COLOR = TOKENS["critical"]
SHADOW = "#000000"


class VerificationScreen(StripGridScreen):
    TITLE = "Verificación"
    CANVAS_HEIGHT = 240

    def __init__(self, master, app, blade: str | None = None) -> None:
        self.trees: dict[str, ttk.Treeview] = {}
        self._rows: dict[str, dict[str, str]] = {}  # cara -> {item: nombre de la foto}
        super().__init__(master, app, blade)

    def _build_footer(self, footer: ttk.Frame) -> None:
        self.continue_button = ttk.Button(footer, text="Continuar a la subida", style="Accent.TButton",
                                          command=self._continue)
        self.continue_button.pack(side="right")
        self.back_button = ttk.Button(footer, text="Volver a resultados", command=self._back)
        self.back_button.pack(side="right", padx=(0, 8))
        ttk.Label(footer, text="Punta", foreground=TIP_COLOR).pack(side="left")
        ttk.Label(footer, text="Raíz", foreground=ROOT_COLOR).pack(side="left", padx=(12, 0))
        ttk.Label(footer, text="Foto elegida", foreground=PHOTO_COLOR).pack(side="left", padx=(12, 0))
        if not self.sections:
            self.continue_button.state(["disabled"])

    def _build_column(self, grid: ttk.Frame, col: int, face: str) -> None:
        frame = ttk.Frame(grid, style="Panel.TFrame", borderwidth=0, relief="flat")
        frame.grid(row=3, column=col, sticky="nsew", padx=4, pady=(6, 0))
        grid.rowconfigure(3, weight=1)
        tree = ttk.Treeview(frame, columns=("photo", "radius", "gsd"), show="headings", height=8,
                            selectmode="browse")
        for key, title, width, anchor in (("photo", "Foto", 120, "w"), ("radius", "Radio (m)", 64, "e"),
                                          ("gsd", "GSD (mm/px)", 72, "e")):
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
                    photo.path.name,
                    decimal(photo.radius_m) if photo.radius_m is not None else "—",
                    decimal(photo.gsd_mm_px) if photo.gsd_mm_px is not None else "—",
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
        from nexus_desktop.ui.screens.upload import UploadScreen

        state = self.app.state
        if not state.sections:
            return
        state.strips = {(s.blade, s.face): s.strip_path for s in state.sections}
        self.app.show(UploadScreen)
