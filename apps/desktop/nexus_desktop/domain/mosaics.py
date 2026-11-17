"""Tiras de pala (las que escribe `domain.reconstruction`) como mosaicos del manifiesto."""
from __future__ import annotations

import threading
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from PIL import Image

STRIP_SIDE, STRIP_QUALITY = 8000, 85


_limit_lock = threading.Lock()
_limit_depth = 0
_limit_saved: int | None = None


@contextmanager
def large_images() -> Iterator[None]:
    """Dentro del bloque Pillow abre imágenes de cualquier tamaño: las tiras que genera la app son
    panorámicas de hasta 65500 px de alto. Al salir (también con error) se restaura el límite
    anterior, así fotos, miniaturas y demás conservan la protección contra «bombas» de
    descompresión. `Image.MAX_IMAGE_PIXELS` es global: los bloques anidados o simultáneos (varios
    hilos) se cuentan y el límite vuelve cuando termina el último."""
    global _limit_depth, _limit_saved
    with _limit_lock:
        if _limit_depth == 0:
            _limit_saved = Image.MAX_IMAGE_PIXELS
            Image.MAX_IMAGE_PIXELS = None
        _limit_depth += 1
    try:
        yield
    finally:
        with _limit_lock:
            _limit_depth -= 1
            if _limit_depth == 0:
                Image.MAX_IMAGE_PIXELS = _limit_saved


@dataclass(frozen=True)
class StripFile:
    path: Path
    blade: str
    face: str


def build_mosaic(strip: StripFile, mosaic_id: str, prefix: str, width_px: int, height_px: int) -> dict:
    return {"id": mosaic_id, "kind": "blade_strip", "spectrum": "rgb", "blade": strip.blade, "face": strip.face,
            "format": "image", "path": f"{prefix}mosaics/{mosaic_id}/strip.webp",
            "width_px": width_px, "height_px": height_px}


def make_strip(src: Path, out: Path) -> tuple[int, int]:
    """Escribe strip.webp (solo reduce si el lado mayor pasa de 8000 px). Devuelve el tamaño guardado (el de las coordenadas de los hallazgos)."""
    with large_images(), Image.open(src) as im:
        im = im.convert("RGB")
        im.thumbnail((STRIP_SIDE, STRIP_SIDE), Image.LANCZOS)
        im.save(out, "WEBP", quality=STRIP_QUALITY)
        return im.size
