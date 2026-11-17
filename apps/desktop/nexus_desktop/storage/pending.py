"""Subidas sin terminar que conoce la app (config.data_dir()/pending.json).

Lista pequeña por usuario de Windows para el panel «Inspecciones locales pendientes» del inicio.
La escribe el final de la verificación («Guardar y subir después»: `ready`, «Lista para subir», con
el nombre de la turbina en `asset` y `project` vacío), la pantalla de subida al empezar
(`in_progress`) y al terminar (completa: se quita; si no,
`cancelled`, `errors`, `interrupted` o `partial` si se omitieron fotos dañadas). Solo guarda la ruta de la carpeta WTG, los nombres del
proyecto y la turbina, el estado y la fecha: nunca tokens ni datos de la sesión. El avance real
de la subida está en el índice de la carpeta (storage/local_index.py).
"""
from __future__ import annotations

import json
import os
import threading
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from nexus_desktop.storage import jsonio

FILE_NAME = "pending.json"
STATUS_TEXT = {
    "ready": "Lista para subir",
    "in_progress": "Subida en curso o interrumpida",
    "interrupted": "Subida interrumpida",
    "cancelled": "Subida cancelada",
    "errors": "Subida con errores",
    "partial": "Algunas fotos no se subieron",
}
_FIELDS = ("folder", "project", "asset", "status", "updated_at")
_lock = threading.Lock()  # la escriben el hilo de Tk y el de la subida


@dataclass
class PendingUpload:
    folder: str
    project: str
    asset: str
    status: str
    updated_at: str


def status_text(status: str) -> str:
    return STATUS_TEXT.get(status, "Subida sin terminar")


def _path(base_dir: Path | None) -> Path:
    if base_dir is None:
        from nexus_desktop import config

        base_dir = config.data_dir()
    return Path(base_dir) / FILE_NAME


def key(folder: str | Path) -> str:
    return os.path.normcase(os.path.normpath(str(folder)))


def _read(path: Path) -> list[PendingUpload]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):  # ausente o dañado: lista vacía (no es información crítica)
        return []
    if not isinstance(data, list):
        return []
    out = []
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("folder"), str):
            out.append(PendingUpload(**{k: str(item.get(k) or "") for k in _FIELDS}))
    return out


def load(base_dir: Path | None = None) -> list[PendingUpload]:
    with _lock:
        return _read(_path(base_dir))


def save_status(folder: Path, project: str, asset: str, status: str, base_dir: Path | None = None) -> None:
    """Crea o actualiza la entrada de `folder` (se conserva su lugar en la lista)."""
    path = _path(base_dir)
    entry = PendingUpload(str(folder), project, asset, status, datetime.now().isoformat(timespec="seconds"))
    with _lock:
        items = _read(path)
        for n, item in enumerate(items):
            if key(item.folder) == key(folder):
                items[n] = entry
                break
        else:
            items.append(entry)
        jsonio.write_json_atomic(path, [asdict(i) for i in items])


def remove(folder: str | Path, base_dir: Path | None = None) -> None:
    path = _path(base_dir)
    with _lock:
        items = _read(path)
        kept = [i for i in items if key(i.folder) != key(folder)]
        if len(kept) != len(items):
            jsonio.write_json_atomic(path, [asdict(i) for i in kept])
