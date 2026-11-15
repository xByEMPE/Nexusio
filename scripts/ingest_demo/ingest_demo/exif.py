"""Lectura de metadatos con exiftool."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path


def read_exif(path: Path, exiftool: Path) -> dict:
    """`exiftool -j -n` sobre un archivo; devuelve el primer elemento."""
    out = subprocess.run(
        [str(exiftool), "-j", "-n", "-charset", "filename=utf8", str(path)],
        check=True, capture_output=True,
    ).stdout
    return json.loads(out.decode("utf-8", errors="replace"))[0]


def num(value) -> float | None:
    """Convierte '+102.977', '-1.0', números y None a float; None si no es numérico."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except ValueError:
        return None
