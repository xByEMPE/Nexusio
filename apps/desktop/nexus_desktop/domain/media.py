"""Hash y derivados WebP."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

PREVIEW_SIDE, THUMB_SIDE, WEBP_QUALITY = 2560, 400, 80


@dataclass(frozen=True)
class Derivatives:
    preview: Path
    thumb: Path
    width_px: int
    height_px: int


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def make_derivatives(src: Path, out_dir: Path) -> Derivatives:
    out_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        width, height = im.size  # dimensiones del original
        im = ImageOps.exif_transpose(im).convert("RGB")
        paths = {}
        for name, side in (("preview", PREVIEW_SIDE), ("thumb", THUMB_SIDE)):
            copy = im.copy()
            copy.thumbnail((side, side), Image.LANCZOS)  # solo reduce
            p = out_dir / f"{name}.webp"
            copy.save(p, "WEBP", quality=WEBP_QUALITY)
            paths[name] = p
    return Derivatives(paths["preview"], paths["thumb"], width, height)
