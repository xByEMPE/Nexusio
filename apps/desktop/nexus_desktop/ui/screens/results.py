"""Resultados de la reconstrucción (de `_show_results_screen` y `_show_blade_results` del original).

Mismo flujo: una pala a la vez (botones de pala arriba) y, por cada cara, la tira cosida con su
tamaño. Además: la cuerda y la escala de la calibración, «Revisar pala» (abre la verificación de
esa pala) y «Continuar a verificación».

Las tiras se muestran reducidas desde la caché de miniaturas, que se lee en segundo plano; las
`PhotoImage` se crean en el hilo de Tk y se liberan en `on_hide` (ver `Screen.on_hide`).
"""
from __future__ import annotations

from pathlib import Path
from tkinter import Canvas, ttk

from PIL import Image, ImageTk

from nexus_desktop.domain import mosaics
from nexus_desktop.domain.marking import Fit, fit_image
from nexus_desktop.domain.reconstruction import SectionResult
from nexus_desktop.domain.wtg_folder import BLADES, FACES
from nexus_desktop.ui import thumbnails
from nexus_desktop.ui.labels import FACE_NAMES
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.theme import TOKENS, font


def _load_strip(path: Path, cache: Path) -> thumbnails.DisplayImage:
    """Miniatura de una tira: se abre con el límite de Pillow relajado solo para ella."""
    with mosaics.large_images():
        return thumbnails.load_display(path, cache)


FALLBACK_CANVAS = 200
NO_STRIP = "Sin tira"


def decimal(value: float, digits: int = 2) -> str:
    """Número con coma decimal (es-ES)."""
    return f"{value:.{digits}f}".replace(".", ",")


ESTIMATED_MARK = "≈"
ESTIMATED_LEGEND = "≈ GSD estimado por interpolación (sin láser) · — sin escala"


def gsd_counts_text(sections) -> str:
    """«3 fotos con escala estimada, 1 sin escala» para una o varias secciones ("" si no hay nada)."""
    estimated = sum(s.gsd_estimated_count for s in sections)
    missing = sum(s.gsd_missing_count for s in sections)
    parts = []
    if estimated:
        parts.append(f"{estimated} {'foto' if estimated == 1 else 'fotos'} con escala estimada")
    if missing:
        parts.append(f"{missing} sin escala")
    return ", ".join(parts)


class StripGridScreen(Screen):
    """Base de resultados y verificación: botones de pala y una columna por cara con su tira."""

    TITLE = ""
    CANVAS_HEIGHT = 380

    def __init__(self, master, app, blade: str | None = None) -> None:
        super().__init__(master, app)
        self.sections: dict[tuple[str, str], SectionResult] = {
            (s.blade, s.face): s for s in app.state.sections}
        blades = [b for b in BLADES if any((b, f) in self.sections for f in FACES)]
        self.blade: str | None = blade if blade in blades else (blades[0] if blades else None)
        self.blade_buttons: dict[str, ttk.Button] = {}
        self.canvases: dict[str, Canvas] = {}
        self.info_labels: dict[str, ttk.Label] = {}
        self.fits: dict[str, Fit] = {}
        self._photos: dict[str, ImageTk.PhotoImage] = {}
        self._display: dict[Path, thumbnails.DisplayImage] = {}
        self._resize_jobs: dict[str, str] = {}
        self._gen = 0

        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text=self.TITLE, style="Title.TLabel").pack(side="left")
        state = app.state
        subtitle = state.title_parts()
        ttk.Label(top, text=" · ".join(subtitle), style="Muted.TLabel").pack(side="left", padx=(12, 0))

        bar = ttk.Frame(self)
        bar.pack(fill="x", pady=(12, 8))
        for b in blades:
            button = ttk.Button(bar, text=f"Pala {b}", command=lambda b=b: self.select_blade(b))
            button.pack(side="left", padx=(0, 8))
            self.blade_buttons[b] = button
        if not blades:
            ttk.Label(bar, text="No hay tiras: vuelve a procesar.", foreground=TOKENS["caution"]).pack(
                side="left")

        footer = ttk.Frame(self)
        footer.pack(side="bottom", fill="x", pady=(12, 0))
        self._build_footer(footer)

        grid = ttk.Frame(self, style="Panel.TFrame", padding=12)
        grid.pack(fill="both", expand=True, pady=(8, 0))
        for col, face in enumerate(FACES):
            grid.columnconfigure(col, weight=1, uniform="faces")
            head = ttk.Frame(grid, style="Panel.TFrame", borderwidth=0, relief="flat")
            head.grid(row=0, column=col, sticky="ew", padx=4, pady=(0, 6))
            ttk.Label(head, text=face, style="Panel.TLabel", font=font(11, "bold")).pack(anchor="w")
            ttk.Label(head, text=FACE_NAMES[face], style="Panel.Muted.TLabel").pack(anchor="w")
            canvas = Canvas(grid, width=FALLBACK_CANVAS, height=self.CANVAS_HEIGHT,
                            background=TOKENS["surface"], highlightthickness=1,
                            highlightbackground=TOKENS["border"])
            canvas.grid(row=1, column=col, sticky="nsew", padx=4, pady=4)
            canvas.bind("<Configure>", lambda _e, f=face: self._schedule_render(f))
            self.canvases[face] = canvas
            info = ttk.Label(grid, text="", style="Panel.Muted.TLabel", wraplength=220, justify="left")
            info.grid(row=2, column=col, sticky="w", padx=4, pady=(2, 0))
            self.info_labels[face] = info
            self._build_column(grid, col, face)
        grid.rowconfigure(1, weight=1)
        self._refresh_buttons()

    # --- ganchos de las subclases ---

    def _build_footer(self, footer: ttk.Frame) -> None:
        raise NotImplementedError

    def _build_column(self, grid: ttk.Frame, col: int, face: str) -> None:
        """Widgets extra bajo la tira de la cara `face` (fila 3 en adelante)."""

    def _info_text(self, section: SectionResult) -> str:
        text = f"{section.width_px} × {section.height_px} px"
        chord = section.chord or {}
        if chord.get("chord_length_px"):
            text += f" · cuerda {round(chord['chord_length_px'])} px"
        return text

    def _decorate(self, face: str) -> None:
        """Se llama tras dibujar la tira de `face` (para marcas sobre ella)."""

    def _blade_changed(self) -> None:
        """Se llama al cambiar de pala, antes de cargar las tiras."""

    # --- pala y tiras ---

    def on_show(self) -> None:
        self._blade_changed()
        self._load_blade()

    def select_blade(self, blade: str) -> None:
        self.blade = blade
        self._refresh_buttons()
        self._blade_changed()
        self._load_blade()

    def _refresh_buttons(self) -> None:
        for b, button in self.blade_buttons.items():
            button.configure(style="Accent.TButton" if b == self.blade else "TButton")

    def section(self, face: str) -> SectionResult | None:
        return self.sections.get((self.blade, face)) if self.blade else None

    def _load_blade(self) -> None:
        self._gen += 1
        gen = self._gen
        self.fits.clear()
        self._photos.clear()
        cache = thumbnails.cache_dir()
        for face in FACES:
            canvas = self.canvases[face]
            canvas.delete("all")
            section = self.section(face)
            if section is None:
                self.info_labels[face].configure(text=NO_STRIP, foreground=TOKENS["text_muted"])
                self._canvas_text(canvas, NO_STRIP, TOKENS["text_subtle"])
                continue
            # Los avisos de la reconstrucción (sin altitud, EXIF ilegible, punta abajo) se ven aquí.
            warnings = list(getattr(section, "warnings", []) or [])
            text = self._info_text(section) + "".join(f"\n{w}" for w in warnings)
            self.info_labels[face].configure(
                text=text, foreground=TOKENS["caution"] if warnings else TOKENS["text_muted"])
            path = section.strip_path
            if path in self._display:
                self._render(face)
                continue
            self._canvas_text(canvas, "Cargando…", TOKENS["text_muted"])
            self.run_async(lambda p=path: _load_strip(p, cache),
                           lambda shown, f=face, p=path: self._loaded(gen, f, p, shown),
                           lambda _exc, f=face, p=path: self._load_failed(gen, f, p))

    def _loaded(self, gen: int, face: str, path: Path, shown: thumbnails.DisplayImage) -> None:
        self._display[path] = shown
        if gen == self._gen:
            self._render(face)

    def _load_failed(self, gen: int, face: str, path: Path) -> None:
        if gen != self._gen:
            return
        canvas = self.canvases[face]
        canvas.delete("all")
        self._canvas_text(canvas, f"No se pudo abrir la tira\n{path.name}", TOKENS["critical"])

    def _canvas_size(self, canvas: Canvas) -> tuple[int, int]:
        w, h = canvas.winfo_width(), canvas.winfo_height()
        if w < 10 or h < 10:
            return FALLBACK_CANVAS, self.CANVAS_HEIGHT
        return w, h

    def _canvas_text(self, canvas: Canvas, text: str, color: str) -> None:
        w, h = self._canvas_size(canvas)
        canvas.create_text(w // 2, h // 2, text=text, fill=color, font=font(10), justify="center")

    def _schedule_render(self, face: str) -> None:
        if face not in self.fits:
            return
        job = self._resize_jobs.pop(face, None)
        if job is not None:
            self.after_cancel(job)
        self._resize_jobs[face] = self.after(80, lambda: self._resized(face))

    def _resized(self, face: str) -> None:
        self._resize_jobs.pop(face, None)
        section = self.section(face)
        if face in self.fits and section is not None and section.strip_path in self._display:
            self._render(face)

    def _render(self, face: str) -> None:
        section = self.section(face)
        shown = self._display[section.strip_path]
        canvas = self.canvases[face]
        w, h = self._canvas_size(canvas)
        fit = fit_image(*shown.original_size, w, h)
        photo = ImageTk.PhotoImage(shown.image.resize((fit.width, fit.height), Image.LANCZOS),
                                   master=canvas)
        canvas.delete("all")
        canvas.create_image(fit.offset_x, fit.offset_y, image=photo, anchor="nw", tags="strip")
        self._photos[face], self.fits[face] = photo, fit
        self._decorate(face)

    def on_hide(self) -> None:
        for job in self._resize_jobs.values():
            self.after_cancel(job)
        self._resize_jobs.clear()
        for canvas in self.canvases.values():
            canvas.delete("all")
        self._photos.clear()


class ResultsScreen(StripGridScreen):
    TITLE = "Resultados de la reconstrucción"

    def _build_footer(self, footer: ttk.Frame) -> None:
        self.cancel_button = ttk.Button(footer, text="Cancelar", command=self._cancel)
        self.cancel_button.pack(side="left")
        self.continue_button = ttk.Button(footer, text="Continuar a verificación",
                                          style="Accent.TButton", command=self._continue)
        self.continue_button.pack(side="right")
        self.review_button = ttk.Button(footer, text="Revisar pala", command=self._review)
        self.review_button.pack(side="right", padx=(0, 8))
        self.back_button = ttk.Button(footer, text="Volver al marcado", command=self._back)
        self.back_button.pack(side="right", padx=(0, 8))
        if not self.sections:
            self.continue_button.state(["disabled"])
            self.review_button.state(["disabled"])

    def _info_text(self, section: SectionResult) -> str:
        text = super()._info_text(section)
        mm = (section.calibration or {}).get("mm_per_px")
        return text + (f" · {decimal(mm)} mm/px" if mm else " · sin calibración")

    def _review(self) -> None:
        from nexus_desktop.ui.screens.verification import VerificationScreen

        if self.blade is not None:
            self.app.show(VerificationScreen, blade=self.blade)

    def _continue(self) -> None:
        from nexus_desktop.ui.screens.verification import VerificationScreen

        if self.sections:
            self.app.show(VerificationScreen)

    def _back(self) -> None:
        from nexus_desktop.ui.screens.marking import MarkingScreen

        self.app.show(MarkingScreen)

    def _cancel(self) -> None:
        """Descarta la carpeta, las marcas y las tiras calculadas y vuelve al inicio."""
        from nexus_desktop.ui.screens.start import StartScreen

        self.app.state.forget_folder()
        self.app.show(StartScreen)
