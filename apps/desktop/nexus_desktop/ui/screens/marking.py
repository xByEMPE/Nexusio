"""Marcado de punta y raíz por pala (de `_show_marking_screen` y `_on_image_click` del original).

Mismo flujo que hoy:
- Una pala a la vez (solo las que existen); cambiar de pala reinicia el modo de marcado.
- Por cada cara, arriba la foto del extremo de la punta y abajo la del extremo de la raíz
  (LE/TE: última y primera foto; PS/SS: primera y última). «Invertir» da la vuelta al orden
  de las fotos de esa cara si el vuelo se hizo al revés (y borra sus marcas).
- Se elige «Marcar punta» o «Marcar raíz» y se hace clic: la punta con 1 clic, la raíz con
  2 clics (los dos bordes de la pala). Sin modo elegido, los clics no marcan nada.
- «Continuar» solo se habilita con todas las secciones presentes marcadas.

Las marcas se guardan en píxeles de la foto original (`MarkingState`); las fotos se muestran
reducidas desde la caché de miniaturas, que se lee en segundo plano.
"""
from __future__ import annotations

from pathlib import Path
from tkinter import Canvas, ttk

from PIL import Image, ImageTk

from nexus_desktop.domain.marking import (
    Fit,
    MarkingState,
    fit_image,
    root_image_index,
    tip_image_index,
)
from nexus_desktop.domain.wtg_folder import FACES
from nexus_desktop.ui import thumbnails
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.theme import TOKENS, font

KINDS = ("tip", "root")
FACE_NAMES = {"LE": "Borde de ataque", "TE": "Borde de salida", "PS": "Intradós", "SS": "Extradós"}
ROW_NAMES = {"tip": "Punta", "root": "Raíz"}
HINTS = {
    None: "Elige «Marcar punta» o «Marcar raíz» y haz clic en la foto.",
    "tip": "Haz clic en la punta de la pala (fila de arriba).",
    "root": "Haz clic en los dos bordes de la pala, en la raíz (fila de abajo).",
}
ALL_MARKED = "Todo marcado."
MARKER_COLOR = TOKENS["caution"]
MARKER_SHADOW = "#000000"
FALLBACK_CANVAS = 200  # como el original: si el lienzo aún no tiene tamaño
MEMORY_CACHE = 16      # miniaturas que se guardan en memoria (las demás, en disco)


class MarkingScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        state = app.state
        if state.marks is None:
            state.marks = MarkingState(state.wtg.blades)
        self.marks: MarkingState = state.marks
        blades = self.marks.present_blades()
        self.blade: str | None = blades[0] if blades else None
        self.mode: str | None = None
        self.canvases: dict[tuple[str, str], Canvas] = {}
        self.fits: dict[tuple[str, str], Fit] = {}
        self.shown: dict[tuple[str, str], Path] = {}
        self.status_labels: dict[str, ttk.Label] = {}
        self.invert_buttons: dict[str, ttk.Button] = {}
        self.blade_buttons: dict[str, ttk.Button] = {}
        self._photos: dict[tuple[str, str], ImageTk.PhotoImage] = {}
        # LRU: lo que se está mostrando (se lee en cada dibujo) no sale al cargar otras fotos.
        self._display: thumbnails.LruCache = thumbnails.LruCache(MEMORY_CACHE)
        self._resize_jobs: dict[tuple[str, str], str] = {}
        self._gen = 0

        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="Marcado de punta y raíz", style="Title.TLabel").pack(side="left")
        subtitle = [x.name for x in (state.project, state.asset) if x is not None]
        if state.wtg is not None and state.wtg.path.name not in subtitle:
            subtitle.append(state.wtg.path.name)
        ttk.Label(top, text=" · ".join(subtitle), style="Muted.TLabel").pack(side="left", padx=(12, 0))

        bar = ttk.Frame(self)
        bar.pack(fill="x", pady=(12, 8))
        for blade in blades:
            button = ttk.Button(bar, command=lambda b=blade: self.select_blade(b))
            button.pack(side="left", padx=(0, 8))
            self.blade_buttons[blade] = button
        self.root_button = ttk.Button(bar, text="Marcar raíz", command=lambda: self._toggle_mode("root"))
        self.root_button.pack(side="right")
        self.tip_button = ttk.Button(bar, text="Marcar punta", command=lambda: self._toggle_mode("tip"))
        self.tip_button.pack(side="right", padx=(0, 8))

        self.hint_label = ttk.Label(self, text=HINTS[None], style="Muted.TLabel")
        self.hint_label.pack(anchor="w")

        footer = ttk.Frame(self)
        footer.pack(side="bottom", fill="x", pady=(12, 0))
        self.cancel_button = ttk.Button(footer, text="Cancelar", command=self._cancel)
        self.cancel_button.pack(side="left")
        self.continue_button = ttk.Button(footer, text="Continuar", style="Accent.TButton",
                                          command=self._continue)
        self.continue_button.pack(side="right")
        self.back_button = ttk.Button(footer, text="Volver", command=self._back)
        self.back_button.pack(side="right", padx=(0, 8))
        self.missing_label = ttk.Label(self, text="", foreground=TOKENS["caution"], wraplength=900,
                                       justify="left")
        self.missing_label.pack(side="bottom", anchor="w", pady=(8, 0))

        grid = ttk.Frame(self, style="Panel.TFrame", padding=12)
        grid.pack(fill="both", expand=True, pady=(8, 0))
        for col in range(1, len(FACES) + 1):
            grid.columnconfigure(col, weight=1, uniform="faces")
        grid.rowconfigure(1, weight=1)
        grid.rowconfigure(2, weight=1)
        for row, kind in ((1, "tip"), (2, "root")):
            ttk.Label(grid, text=ROW_NAMES[kind], style="Panel.Muted.TLabel").grid(
                row=row, column=0, sticky="w", padx=(0, 8))
        for col, face in enumerate(FACES, start=1):
            head = ttk.Frame(grid, style="Panel.TFrame", borderwidth=0, relief="flat")
            head.grid(row=0, column=col, sticky="ew", padx=4, pady=(0, 6))
            names = ttk.Frame(head, style="Panel.TFrame", borderwidth=0, relief="flat")
            names.pack(side="left")
            ttk.Label(names, text=face, style="Panel.TLabel", font=font(11, "bold")).pack(anchor="w")
            ttk.Label(names, text=FACE_NAMES[face], style="Panel.Muted.TLabel").pack(anchor="w")
            invert = ttk.Button(head, text="Invertir", command=lambda f=face: self.invert(f))
            invert.pack(side="right")
            self.invert_buttons[face] = invert
            for row, kind in ((1, "tip"), (2, "root")):
                canvas = Canvas(grid, width=FALLBACK_CANVAS, height=150, background=TOKENS["surface"],
                                highlightthickness=2, highlightbackground=TOKENS["border"],
                                cursor="crosshair")
                canvas.grid(row=row, column=col, sticky="nsew", padx=4, pady=4)
                canvas.bind("<Button-1>", lambda e, f=face, k=kind: self.click(f, k, e.x, e.y))
                canvas.bind("<Configure>", lambda _e, f=face, k=kind: self._schedule_render(f, k))
                self.canvases[(face, kind)] = canvas
            status = ttk.Label(grid, text="", style="Panel.Muted.TLabel")
            status.grid(row=3, column=col, sticky="w", padx=4, pady=(4, 0))
            self.status_labels[face] = status

        self._refresh()

    def on_show(self) -> None:
        self._load_blade()

    # --- pala y modo ---

    def select_blade(self, blade: str) -> None:
        self.blade = blade
        self.set_mode(None)  # como el original: cambiar de pala reinicia el modo
        self._load_blade()

    def set_mode(self, mode: str | None) -> None:
        self.mode = mode
        self.tip_button.configure(style="Accent.TButton" if mode == "tip" else "TButton")
        self.root_button.configure(style="Accent.TButton" if mode == "root" else "TButton")
        self.hint_label.configure(text=HINTS[mode])

    def _toggle_mode(self, mode: str) -> None:
        self.set_mode(None if self.mode == mode else mode)

    def invert(self, face: str) -> None:
        if self.blade is None or face not in self.marks.faces(self.blade):
            return
        self.marks.invert_section(self.blade, face)
        self._load_blade()
        self.hint_label.configure(
            text=f"Se invirtió el orden de las fotos de {face}; vuelve a marcar esa cara.")

    # --- fotos ---

    def _image_index(self, face: str, kind: str) -> int:
        count = len(self.marks.blades[self.blade][face])
        return tip_image_index(face, count) if kind == "tip" else root_image_index(face, count)

    def _load_blade(self) -> None:
        self._gen += 1
        gen = self._gen
        self.shown.clear()
        self.fits.clear()
        self._photos.clear()
        faces = self.marks.faces(self.blade) if self.blade else []
        wanted: list[Path] = []
        for face in FACES:
            present = face in faces
            self.invert_buttons[face].state(["!disabled"] if present else ["disabled"])
            for kind in KINDS:
                canvas = self.canvases[(face, kind)]
                canvas.delete("all")
                if not present:
                    self._canvas_text(canvas, "Sin fotos", TOKENS["text_subtle"])
                    continue
                path = self.marks.blades[self.blade][face][self._image_index(face, kind)]
                self.shown[(face, kind)] = path
                if path in self._display:
                    self._render(face, kind)
                else:
                    self._canvas_text(canvas, "Cargando…", TOKENS["text_muted"])
                    if path not in wanted:
                        wanted.append(path)
        self._refresh()
        cache = thumbnails.cache_dir()
        for path in wanted:
            self.run_async(lambda p=path: thumbnails.load_display(p, cache),
                           lambda shown, p=path: self._loaded(gen, p, shown),
                           lambda _exc, p=path: self._load_failed(gen, p))

    def _loaded(self, gen: int, path: Path, shown: thumbnails.DisplayImage) -> None:
        self._display[path] = shown  # LruCache descarta lo usado hace más tiempo
        if gen != self._gen:
            return
        for key, p in list(self.shown.items()):
            if p == path:
                self._render(*key)

    def _load_failed(self, gen: int, path: Path) -> None:
        if gen != self._gen:
            return
        for key, p in self.shown.items():
            if p == path:
                canvas = self.canvases[key]
                canvas.delete("all")
                self._canvas_text(canvas, f"No se pudo abrir la foto\n{path.name}", TOKENS["critical"])

    def _canvas_size(self, canvas: Canvas) -> tuple[int, int]:
        w, h = canvas.winfo_width(), canvas.winfo_height()
        if w < 10 or h < 10:
            return FALLBACK_CANVAS, FALLBACK_CANVAS
        return w, h

    def _canvas_text(self, canvas: Canvas, text: str, color: str) -> None:
        w, h = self._canvas_size(canvas)
        canvas.create_text(w // 2, h // 2, text=text, fill=color, font=font(10), justify="center")

    def _schedule_render(self, face: str, kind: str) -> None:
        key = (face, kind)
        if key not in self.fits:
            return
        job = self._resize_jobs.pop(key, None)
        if job is not None:
            self.after_cancel(job)
        self._resize_jobs[key] = self.after(80, lambda: self._resized(key))

    def _resized(self, key: tuple[str, str]) -> None:
        self._resize_jobs.pop(key, None)
        if key in self.fits and self.shown.get(key) in self._display:
            self._render(*key)

    def _render(self, face: str, kind: str) -> None:
        key = (face, kind)
        shown = self._display[self.shown[key]]
        canvas = self.canvases[key]
        w, h = self._canvas_size(canvas)
        fit = fit_image(*shown.original_size, w, h)
        # Solo se reduce para mostrar; la escala de `fit` es respecto a la foto ORIGINAL.
        photo = ImageTk.PhotoImage(shown.image.resize((fit.width, fit.height), Image.LANCZOS),
                                   master=canvas)
        canvas.delete("all")
        canvas.create_image(fit.offset_x, fit.offset_y, image=photo, anchor="nw", tags="image")
        self._photos[key], self.fits[key] = photo, fit
        self._draw_marks(face, kind)
        self._refresh()

    # --- clics y marcadores ---

    def click(self, face: str, kind: str, x: float, y: float) -> None:
        """Clic en el lienzo (coordenadas del lienzo) de la cara y fila `kind`."""
        if self.mode != kind or self.blade is None:
            return
        fit = self.fits.get((face, kind))
        if fit is None:  # la foto aún no se ha cargado
            return
        mark = fit.to_image(x, y)
        if not fit.contains(mark):  # clic en el margen, fuera de la foto
            return
        index = self._image_index(face, kind)
        if kind == "tip":
            self.marks.set_tip(self.blade, face, index, mark)
        else:
            self.marks.add_root_click(self.blade, face, index, mark)
        self._draw_marks(face, kind)
        self._refresh()

    def _draw_marks(self, face: str, kind: str) -> None:
        canvas, fit = self.canvases[(face, kind)], self.fits.get((face, kind))
        canvas.delete("marker")
        if fit is None:
            return
        section = self.marks.section(self.blade, face)
        index = self._image_index(face, kind)
        if kind == "tip" and section.tip is not None and section.tip_index == index:
            self._draw_tip(canvas, fit.to_canvas(section.tip))
        elif kind == "root" and section.root and section.root_index == index:
            points = [fit.to_canvas(m) for m in section.root]
            if len(points) == 1:
                x, y = points[0]
                canvas.create_oval(x - 6, y - 6, x + 6, y + 6, fill=MARKER_COLOR,
                                   outline=MARKER_SHADOW, width=2, tags="marker")
            else:
                self._draw_root(canvas, *points)

    def _line(self, canvas: Canvas, *coords: float) -> None:
        canvas.create_line(*coords, fill=MARKER_SHADOW, width=5, tags="marker")
        canvas.create_line(*coords, fill=MARKER_COLOR, width=3, tags="marker")

    def _draw_tip(self, canvas: Canvas, pos: tuple[float, float]) -> None:
        """Chevron Λ con el vértice en la punta (como `_draw_tip_marker`)."""
        x, y = pos
        size = 30
        self._line(canvas, x - size, y + size, x, y, x + size, y + size)

    def _draw_root(self, canvas: Canvas, p1: tuple[float, float], p2: tuple[float, float]) -> None:
        """Línea horizontal con flechas hacia dentro en los dos bordes (como `_draw_root_marker`)."""
        (x1, y1), (x2, y2) = sorted((p1, p2))
        y = (y1 + y2) / 2
        arrow = 20
        self._line(canvas, x1, y, x2, y)
        self._line(canvas, x1, y - arrow, x1 + arrow, y, x1, y + arrow)
        self._line(canvas, x2, y - arrow, x2 - arrow, y, x2, y + arrow)

    # --- estado ---

    def _refresh(self) -> None:
        for blade, button in self.blade_buttons.items():
            done = " ✓" if self.marks.is_blade_complete(blade) else ""
            button.configure(text=f"Pala {blade}{done}",
                             style="Accent.TButton" if blade == self.blade else "TButton")
        faces = self.marks.faces(self.blade) if self.blade else []
        for face in FACES:
            label = self.status_labels[face]
            if face not in faces:
                label.configure(text="", foreground=TOKENS["text_muted"])
                for kind in KINDS:
                    self.canvases[(face, kind)].configure(highlightbackground=TOKENS["border"])
                continue
            section = self.marks.section(self.blade, face)
            missing = self.marks.missing_parts(self.blade, face)
            if not missing:
                label.configure(text="Punta ✓ · Raíz ✓", foreground=TOKENS["telemetry"])
            else:
                text = "Falta: " + ", ".join(missing)
                if len(section.root) == 1:
                    text += " (1 de 2 clics)"
                label.configure(text=text, foreground=TOKENS["caution"])
            done = {"tip": section.tip is not None, "root": section.root_complete}
            for kind in KINDS:
                self.canvases[(face, kind)].configure(
                    highlightbackground=TOKENS["accent"] if done[kind] else TOKENS["caution"])

        pending = []
        for blade in self.marks.present_blades():
            faces = [f for f in self.marks.faces(blade) if not self.marks.is_section_complete(blade, f)]
            if faces:
                pending.append(f"pala {blade}: {', '.join(faces)}")
        self.missing_label.configure(text=("Falta marcar: " + " · ".join(pending)) if pending else ALL_MARKED,
                                     foreground=TOKENS["caution"] if pending else TOKENS["telemetry"])
        self.continue_button.state(["!disabled"] if self.marks.is_complete() else ["disabled"])

    # --- navegación ---

    def _continue(self) -> None:
        if not self.marks.is_complete():
            return
        from nexus_desktop.ui.screens.processing import ProcessingScreen

        self.app.show(ProcessingScreen)

    def _back(self) -> None:
        from nexus_desktop.ui.screens.import_ import ImportScreen

        self.app.show(ImportScreen)

    def _cancel(self) -> None:
        """Descarta la carpeta y las marcas y vuelve al inicio."""
        from nexus_desktop.ui.screens.start import StartScreen

        self.app.state.forget_folder()
        self.app.show(StartScreen)

    def on_hide(self) -> None:
        for job in self._resize_jobs.values():
            self.after_cancel(job)
        self._resize_jobs.clear()
        # Las imágenes Tk se liberan aquí, en el hilo de Tk. Si las liberara el recolector de
        # ciclos (que puede correr en un hilo de trabajo), su __del__ llamaría a Tcl desde ese
        # hilo y la app se quedaría bloqueada.
        for canvas in self.canvases.values():
            canvas.delete("all")
        self._photos.clear()
