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
        self.load_warning: str | None = None
        self._uploaded: set[str] = set()
        self._data: dict = {"inspections": {}, "captures": {}, "mosaics": {}}
        self._load()

    def _backup_path(self) -> Path:
        candidate = self.path.with_name(INDEX_NAME + ".bak")
        n = 0
        while candidate.exists():
            n += 1
            candidate = self.path.with_name(f"{INDEX_NAME}.bak.{n}")
        return candidate

    @staticmethod
    def _str_map(value: object) -> dict[str, str]:
        if not isinstance(value, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in value.items()
        ):
            raise ValueError("mapa inválido")
        return dict(value)

    def _quarantine(self) -> None:
        try:
            backup = self._backup_path()
            os.replace(self.path, backup)
            self.load_warning = (
                f"El índice local estaba dañado; se guardó copia en {backup.name} "
                "y se empezó uno nuevo."
            )
        except OSError as exc:
            self.load_warning = (
                f"El índice local está dañado y no se pudo respaldar ({exc}); "
                "se usa un índice vacío en memoria."
            )

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            text = self.path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            self._quarantine()
            return
        except OSError as exc:
            self.load_warning = (
                f"No se pudo leer el índice local ({exc}); se usa un índice vacío."
            )
            return
        try:
            raw = json.loads(text)
            if not isinstance(raw, dict):
                raise ValueError("índice no es un objeto")
            data = {
                key: self._str_map(raw.get(key, {}))
                for key in ("inspections", "captures", "mosaics")
            }
            up = raw.get("uploaded", [])
            if not isinstance(up, list) or not all(isinstance(x, str) for x in up):
                raise ValueError("uploaded inválido")
            uploaded = set(up)
        except (ValueError, TypeError):
            self._quarantine()
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

    def unmark_uploaded(self, object_path: str) -> None:
        """Olvida que `object_path` se subió (el servidor dijo que no está: `missing_object`)."""
        self._uploaded.discard(object_path)

    def is_uploaded(self, object_path: str) -> bool:
        return object_path in self._uploaded

    def save(self) -> None:
        """Escritura atómica (temporal + replace). Propaga OSError tras limpiar el temporal.

        Contrato: llamar a save() justo después de crear ids y antes de subir; agrupar
        los guardados (no uno por objeto) cuando se marquen miles de objetos.
        """
        payload = {**self._data, "uploaded": sorted(self._uploaded)}
        fd, tmp = tempfile.mkstemp(dir=self.folder, prefix=INDEX_NAME + ".", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
