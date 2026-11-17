"""Filtro de fotos de una carpeta (módulo hoja: sin imports del paquete, para no crear ciclos)."""
from __future__ import annotations

from pathlib import Path

JPEG_EXTS = (".jpg", ".jpeg")


def list_jpegs(folder: Path) -> list[Path]:
    """JPEG de `folder` (sin subcarpetas) ordenados por nombre; sin ocultos (`.x`, `._x` de macOS)."""
    return sorted(p for p in Path(folder).iterdir()
                  if p.is_file() and p.suffix.lower() in JPEG_EXTS and not p.name.startswith("."))
