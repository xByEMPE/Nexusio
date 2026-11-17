"""Marcado de punta y raíz por sección (pala × cara). Lógica pura: sin Tk.

Mismo flujo que el original (`_on_image_click` de blade_importer_app.py):
- La punta se marca con 1 clic en la foto del extremo de la punta.
- La raíz se marca con 2 clics (los dos bordes de la pala) en la foto del extremo de la raíz.
  Un tercer clic empieza una medida nueva: se descarta la anterior y la sección queda
  incompleta hasta el cuarto clic (lo que se ve en pantalla es siempre lo guardado).
- Solo cuentan las secciones que existen en la carpeta WTG (caras con al menos una foto).

Las marcas se guardan en píxeles de la foto ORIGINAL (no del lienzo ni de la miniatura).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .wtg_folder import BLADES, FACES

# LE y TE se vuelan de la raíz a la punta (la última foto es la punta);
# PS y SS de la punta a la raíz (la primera foto es la punta).
ROOT_TO_TIP_FACES = ("LE", "TE")


def tip_image_index(face: str, count: int) -> int:
    """Índice de la foto donde se marca la punta (regla de `_load_blade_images`)."""
    return count - 1 if face in ROOT_TO_TIP_FACES else 0


def root_image_index(face: str, count: int) -> int:
    """Índice de la foto donde se marca la raíz."""
    return 0 if face in ROOT_TO_TIP_FACES else count - 1


@dataclass(frozen=True)
class Mark:
    x: float
    y: float

    def to_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y}


@dataclass
class SectionMarks:
    tip: Mark | None = None
    root: list[Mark] = field(default_factory=list)
    tip_index: int | None = None   # índice (en la lista de fotos de la sección) de la foto de la punta
    root_index: int | None = None  # ídem para la raíz

    @property
    def root_complete(self) -> bool:
        return len(self.root) == 2

    @property
    def complete(self) -> bool:
        return self.tip is not None and self.root_complete

    def root_line(self) -> dict[str, float] | None:
        """La raíz como la guardaba el original (`root_data`): x1 < x2, y media y ancho."""
        if not self.root_complete:
            return None
        a, b = self.root
        return {"x1": min(a.x, b.x), "x2": max(a.x, b.x), "y": (a.y + b.y) / 2,
                "width": abs(b.x - a.x)}


@dataclass(frozen=True)
class Fit:
    """Cómo se dibuja una foto en un lienzo: escala respecto a la ORIGINAL y desplazamiento."""
    scale: float
    offset_x: int
    offset_y: int
    width: int    # tamaño dibujado en el lienzo
    height: int
    image_width: int   # tamaño de la foto original
    image_height: int

    def to_image(self, cx: float, cy: float) -> Mark:
        return canvas_to_image(cx, cy, self.scale, self.offset_x, self.offset_y)

    def to_canvas(self, mark: Mark) -> tuple[float, float]:
        return mark.x * self.scale + self.offset_x, mark.y * self.scale + self.offset_y

    def contains(self, mark: Mark) -> bool:
        return 0 <= mark.x < self.image_width and 0 <= mark.y < self.image_height


def fit_image(img_w: int, img_h: int, canvas_w: int, canvas_h: int, margin: int = 10) -> Fit:
    """Escala manteniendo la proporción y centra, igual que `_load_image_to_canvas`."""
    ratio = min((canvas_w - margin) / img_w, (canvas_h - margin) / img_h)
    new_w = max(1, int(img_w * ratio))
    new_h = max(1, int(img_h * ratio))
    return Fit(scale=ratio, offset_x=(canvas_w - new_w) // 2, offset_y=(canvas_h - new_h) // 2,
               width=new_w, height=new_h, image_width=img_w, image_height=img_h)


def canvas_to_image(cx: float, cy: float, scale: float, offset_x: float, offset_y: float) -> Mark:
    """Clic en el lienzo → píxeles de la foto original: (clic − desplazamiento) / escala."""
    return Mark((cx - offset_x) / scale, (cy - offset_y) / scale)


class MarkingState:
    """Marcas de punta y raíz de las secciones presentes en una carpeta WTG.

    `blades` es `WtgFolder.blades` ({pala: {cara: [fotos]}}) y se guarda por referencia:
    `invert_section` invierte el orden de las fotos ahí mismo, como hacía el original, para
    que la reconstrucción vea la dirección de vuelo corregida.
    """

    def __init__(self, blades: dict[str, dict[str, list[Path]]]) -> None:
        self.blades = blades
        self._sections: dict[tuple[str, str], SectionMarks] = {
            (b, f): SectionMarks()
            for b in BLADES for f in FACES if blades.get(b, {}).get(f)
        }
        self._inverted: set[tuple[str, str]] = set()

    # --- estructura ---

    def present_blades(self) -> list[str]:
        return [b for b in BLADES if any((b, f) in self._sections for f in FACES)]

    def faces(self, blade: str) -> list[str]:
        return [f for f in FACES if (blade, f) in self._sections]

    def section(self, blade: str, face: str) -> SectionMarks:
        try:
            return self._sections[(blade, face)]
        except KeyError:
            raise KeyError(f"La sección {blade}/{face} no existe en la carpeta") from None

    def _checked(self, blade: str, face: str, image_index: int) -> SectionMarks:
        section = self.section(blade, face)
        if not 0 <= image_index < len(self.blades[blade][face]):
            raise ValueError(f"Índice de foto fuera de rango en {blade}/{face}: {image_index}")
        return section

    # --- marcas ---

    def set_tip(self, blade: str, face: str, image_index: int, mark: Mark) -> None:
        """Marca (o vuelve a marcar) la punta: siempre reemplaza la anterior."""
        section = self._checked(blade, face, image_index)
        section.tip, section.tip_index = mark, image_index

    def add_root_click(self, blade: str, face: str, image_index: int, mark: Mark) -> bool:
        """Añade un clic de la raíz y devuelve si la raíz quedó completa (2 clics).
        Si ya había 2 clics, o el clic es en otra foto, empieza una medida nueva."""
        section = self._checked(blade, face, image_index)
        if section.root_complete or section.root_index != image_index:
            section.root = []
        section.root.append(mark)
        section.root_index = image_index
        return section.root_complete

    def invert_section(self, blade: str, face: str) -> None:
        """Invierte el orden de las fotos de la sección (vuelo al revés) y borra sus marcas:
        la foto de la punta pasa a ser la de la raíz, así que las marcas ya no valen."""
        self.section(blade, face)
        self.blades[blade][face].reverse()
        self._sections[(blade, face)] = SectionMarks()
        self._inverted ^= {(blade, face)}

    def is_inverted(self, blade: str, face: str) -> bool:
        return (blade, face) in self._inverted

    # --- completitud ---

    def is_section_complete(self, blade: str, face: str) -> bool:
        section = self._sections.get((blade, face))
        return section is not None and section.complete

    def missing_parts(self, blade: str, face: str) -> list[str]:
        section = self.section(blade, face)
        return ([] if section.tip is not None else ["punta"]) + ([] if section.root_complete else ["raíz"])

    def is_blade_complete(self, blade: str) -> bool:
        faces = self.faces(blade)
        return bool(faces) and all(self.is_section_complete(blade, f) for f in faces)

    def is_complete(self) -> bool:
        blades = self.present_blades()
        return bool(blades) and all(self.is_blade_complete(b) for b in blades)

    # --- serialización (para la reconstrucción y el manifiesto) ---

    def to_dict(self) -> dict[str, Any]:
        """{"version": 1, "sections": {pala: {cara: {...}}}, "inverted": ["A/LE", ...]}.
        Coordenadas en píxeles de la foto original; `*_image` es la ruta de esa foto."""
        sections: dict[str, dict[str, Any]] = {}
        for (blade, face), s in self._sections.items():
            images = self.blades[blade][face]
            sections.setdefault(blade, {})[face] = {
                "tip_marker": s.tip.to_dict() if s.tip else None,
                "tip_image_index": s.tip_index if s.tip else None,
                "tip_image": str(images[s.tip_index]) if s.tip else None,
                "root_markers": [m.to_dict() for m in s.root],
                "root_image_index": s.root_index if s.root else None,
                "root_image": str(images[s.root_index]) if s.root else None,
            }
        inverted = [f"{b}/{f}" for b in BLADES for f in FACES if (b, f) in self._inverted]
        return {"version": 1, "sections": sections, "inverted": inverted}

    @classmethod
    def from_dict(cls, blades: dict[str, dict[str, list[Path]]], data: dict[str, Any]) -> "MarkingState":
        """Restaura las marcas sobre `blades` en el orden en que los deja `scan_wtg`: vuelve a
        aplicar las inversiones guardadas antes de las marcas."""
        state = cls(blades)
        for code in data.get("inverted", []):
            blade, face = code.split("/")
            state.invert_section(blade, face)
        for blade, faces in data.get("sections", {}).items():
            for face, s in faces.items():
                if (blade, face) not in state._sections:
                    continue
                if s.get("tip_marker"):
                    state.set_tip(blade, face, s["tip_image_index"], Mark(**s["tip_marker"]))
                for m in s.get("root_markers", []):
                    state.add_root_click(blade, face, s["root_image_index"], Mark(**m))
        return state
