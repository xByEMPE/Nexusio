"""Índice local idempotente (ids estables y objetos ya subidos) dentro de la carpeta WTG."""
from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path

INDEX_NAME = ".ingest_index.json"


class LocalIndex:
    def __init__(self, folder: Path) -> None:
        self.folder = Path(folder)
        self.path = self.folder / INDEX_NAME
        self._uploaded: set[str] = set()
        self._data: dict = {"inspections": {}, "captures": {}, "mosaics": {}}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ValueError("índice no es un objeto")
            data = {
                "inspections": dict(raw.get("inspections", {})),
                "captures": dict(raw.get("captures", {})),
                "mosaics": dict(raw.get("mosaics", {})),
            }
            uploaded = set(raw.get("uploaded", []))
        except (ValueError, TypeError):
            os.replace(self.path, self.path.with_name(INDEX_NAME + ".bak"))
            return
        self._data = data
        self._uploaded = uploaded

    def capture_id(self, sha: str) -> str:
        return self._data["captures"].setdefault(sha, str(uuid.uuid4()))

    def mosaic_id(self, name: str) -> str:
        return self._data["mosaics"].setdefault(name, str(uuid.uuid4()))

    def inspection_id(self, asset_id: str) -> str | None:
        return self._data["inspections"].get(asset_id)

    def set_inspection(self, asset_id: str, inspection_id: str) -> None:
        self._data["inspections"][asset_id] = inspection_id

    def mark_uploaded(self, object_path: str) -> None:
        self._uploaded.add(object_path)

    def is_uploaded(self, object_path: str) -> bool:
        return object_path in self._uploaded

    def save(self) -> None:
        payload = {**self._data, "uploaded": sorted(self._uploaded)}
        fd, tmp = tempfile.mkstemp(dir=self.folder, prefix=INDEX_NAME + ".", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
