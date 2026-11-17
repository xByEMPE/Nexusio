"""Escritura atómica de JSON (módulo hoja, lo usan pending.py y ready.py)."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path


def write_json_atomic(path: Path, data, indent: int = 2) -> None:
    """Escribe `data` en UTF-8 a un temporal junto a `path` y lo renombra: nunca queda un archivo a
    medias y, si algo falla (disco lleno, valor no serializable), el anterior se conserva y el
    temporal se borra."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".json_", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
