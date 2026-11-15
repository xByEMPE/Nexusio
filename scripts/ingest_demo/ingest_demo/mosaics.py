"""Tiras de pala (`*_img_stitched/<x>_<A|B|C>_<cara>.<ext>`) como mosaicos."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # las tiras son panorámicas grandes
STRIP_SIDE, STRIP_QUALITY = 8000, 85
FACE_NAMES = {"LeadingEdge": "LE", "PressureSide": "PS", "SuctionSide": "SS", "TrailingEdge": "TE"}
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".tif")
STRIP_NAME = re.compile(r"^.+_([ABC])_(LeadingEdge|PressureSide|SuctionSide|TrailingEdge)$")


@dataclass(frozen=True)
class StripFile:
    path: Path
    blade: str
    face: str


def scan(folder: Path) -> list[StripFile]:
    out = []
    for d in sorted(p for p in Path(folder).glob("*_img_stitched") if p.is_dir()):
        for f in sorted(p for p in d.iterdir() if p.is_file()):
            if f.suffix.lower() not in IMAGE_EXTS:
                print(f"  archivo ignorado (no es imagen): {f.name}")
                continue
            m = STRIP_NAME.match(f.stem)
            if not m:
                print(f"  tira ignorada (nombre no válido): {f.name}")
                continue
            out.append(StripFile(f, m.group(1), FACE_NAMES[m.group(2)]))
    return out


def build_mosaic(strip: StripFile, mosaic_id: str, prefix: str, width_px: int, height_px: int) -> dict:
    return {"id": mosaic_id, "kind": "blade_strip", "spectrum": "rgb", "blade": strip.blade, "face": strip.face,
            "format": "image", "path": f"{prefix}mosaics/{mosaic_id}/strip.webp",
            "width_px": width_px, "height_px": height_px}


def make_strip(src: Path, out: Path) -> tuple[int, int]:
    """Escribe strip.webp (solo reduce si el lado mayor pasa de 8000 px). Devuelve el tamaño guardado (el de las coordenadas de los hallazgos)."""
    with Image.open(src) as im:
        im = im.convert("RGB")
        im.thumbnail((STRIP_SIDE, STRIP_SIDE), Image.LANCZOS)
        im.save(out, "WEBP", quality=STRIP_QUALITY)
        return im.size
