"""Inspección procesada y lista para subir: `{wtg}_inspeccion_lista.json` dentro de la carpeta WTG.

Guarda lo que `build_upload_plan` necesita para subir más tarde, incluso tras cerrar y volver a
abrir la app: nombre de la turbina, longitud de pala y, por sección, cara, pala, tira, tamaño,
calibración (en píxeles de la tira ORIGINAL: no se pre-escala, el orquestador de la subida la
escala) y las fotos con radio, GSD y la dirección de captura.

Todas las rutas son relativas a la carpeta WTG (separador «/»), así el archivo sobrevive a mover
o renombrar la carpeta. No lleva sesión, proyecto ni turbina del servidor (se eligen al subir) ni
credenciales. La escritura es atómica (temporal + reemplazo) y nunca borra datos del técnico.
Al cargar se valida versión, tipos y que existan las tiras y las fotos; cualquier problema es un
`ReadyError` con un mensaje en español.
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath, PureWindowsPath

from nexus_desktop import config
from nexus_desktop.storage import pending
from nexus_desktop.domain.reconstruction import PhotoResult, SectionResult
from nexus_desktop.domain.wtg_folder import BLADES, FACES, scan_wtg

VERSION = 1
FILE_SUFFIX = "_inspeccion_lista.json"
STATUS_READY = "ready"
STATUS_UPLOADED = "uploaded"
MAX_NAMED = 3  # cuántos archivos que faltan se nombran en el mensaje

CORRUPT = ("El archivo de la inspección guardada ({name}) está dañado o no se puede leer. Abre la "
           "carpeta de nuevo con «Importar carpeta WTG» y vuelve a procesarla.")
NO_FILE = ("No hay datos guardados para subir en esta carpeta. Ábrela con «Importar carpeta WTG» y "
           "procésala de nuevo.")
NO_FOLDER = "La carpeta de la inspección ya no existe (¿la moviste o la borraste?): {folder}"
BAD_VERSION = ("La inspección guardada es de otra versión de la app (versión {version}) y esta no la "
               "puede leer. Vuelve a procesar la carpeta.")
OUTSIDE = ("La inspección guardada apunta a un archivo fuera de la carpeta ({name}). Vuelve a "
           "procesar la carpeta.")
MISSING_STRIPS = ("Faltan tiras de la inspección guardada: {names}{more}. Vuelve a procesar la carpeta "
                  "para generarlas.")
MISSING_PHOTOS = ("Faltan fotos de la inspección guardada: {names}{more}. Comprueba que la carpeta "
                  "WTG está completa (¿se movieron o borraron fotos?).")


class ReadyError(Exception):
    """El archivo de la inspección lista no existe, está dañado o no coincide con la carpeta
    (mensaje legible en español, sin trazas)."""


@dataclass
class ReadyInspection:
    folder: Path
    status: str
    turbine_name: str
    blade_length_m: float
    sections: list[SectionResult]
    wtg: object  # WtgFolder leída de nuevo de la carpeta

    def to_state(self):
        """AppState con lo necesario para subir (sin proyecto ni turbina: se eligen al subir)."""
        from nexus_desktop.ui.app import AppState

        state = AppState()
        state.wtg = self.wtg
        state.turbine_name = self.turbine_name
        state.blade_length_m = self.blade_length_m
        state.sections = list(self.sections)
        state.strips = {(s.blade, s.face): s.strip_path for s in self.sections}
        return state


def _wtg_name(folder: Path) -> str:
    return Path(folder).name.replace(" ", "")


def ready_path(folder: Path) -> Path:
    return Path(folder) / f"{_wtg_name(folder)}{FILE_SUFFIX}"


def find_file(folder: Path) -> Path | None:
    """El archivo de la carpeta: el que lleva su nombre o, si la carpeta se renombró, el único
    `*_inspeccion_lista.json` que haya. None si no hay o hay varios sin cuál elegir."""
    folder = Path(folder)
    exact = ready_path(folder)
    if exact.is_file():
        return exact
    try:
        found = sorted(p for p in folder.glob(f"*{FILE_SUFFIX}") if p.is_file())
    except OSError:
        return None
    return found[0] if len(found) == 1 else None


# --- escritura ------------------------------------------------------------------------------

def _rel(folder: Path, path: Path) -> str:
    """Ruta relativa a la carpeta con «/»; una ruta fuera de la carpeta no se guarda tal cual."""
    try:
        return PurePosixPath(*Path(path).relative_to(folder).parts).as_posix()
    except ValueError:
        raise ReadyError(OUTSIDE.format(name=Path(path).name)) from None


def _write_atomic(path: Path, data: dict) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def save_ready(state) -> Path:
    """Guarda el estado procesado en la carpeta WTG y devuelve la ruta del archivo."""
    if state.wtg is None or not state.sections or not state.blade_length_m:
        raise ReadyError("No hay una inspección procesada que guardar.")
    folder = Path(state.wtg.path)
    data = {
        "version": VERSION,
        "status": STATUS_READY,
        "app_version": config.VERSION,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "turbine_name": state.turbine_name or folder.name,
        "blade_length_m": state.blade_length_m,
        "sections": [{
            "blade": s.blade, "face": s.face, "strip": _rel(folder, s.strip_path),
            "width_px": s.width_px, "height_px": s.height_px, "direction": s.direction,
            "calibration": s.calibration, "warnings": list(s.warnings),
            "photos": [{"file": _rel(folder, p.path), "radius_m": p.radius_m, "gsd_mm_px": p.gsd_mm_px}
                       for p in s.photos],
        } for s in state.sections],
    }
    path = ready_path(folder)
    _write_atomic(path, data)
    return path


def register_ready(state, keep_existing: bool = False) -> Path:
    """Guarda la inspección (`save_ready`) y la anota en la lista local (`pending.json`) como «Lista
    para subir», con el nombre de la turbina. `keep_existing`: si la carpeta ya figura en la lista
    (p. ej. con una subida interrumpida) se deja su estado. Puede lanzar ReadyError u OSError."""
    path = save_ready(state)
    folder = Path(state.wtg.path)
    if keep_existing and any(pending._key(e.folder) == pending._key(folder) for e in pending.load()):
        return path
    pending.save_status(folder, "", state.turbine_name or folder.name, STATUS_READY)
    return path


def mark_uploaded(folder: Path) -> None:
    """Tras una subida completa: el archivo pasa a «uploaded» (los datos se conservan). Sin
    archivo o ilegible no hace nada."""
    path = find_file(folder)
    if path is None:
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(data, dict):
        data["status"] = STATUS_UPLOADED
        _write_atomic(path, data)


# --- lectura y validación -------------------------------------------------------------------

def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _optional_number(value) -> bool:
    return value is None or _is_number(value)


def _safe_relative(text: object) -> PurePosixPath:
    if not isinstance(text, str) or not text.strip():
        raise ValueError
    if PureWindowsPath(text).is_absolute() or PureWindowsPath(text).drive or text.startswith(("/", "\\")):
        raise ReadyError(OUTSIDE.format(name=text))
    rel = PurePosixPath(text.replace("\\", "/"))
    if ".." in rel.parts:
        raise ReadyError(OUTSIDE.format(name=text))
    return rel


def _parse_photo(folder: Path, item) -> PhotoResult:
    if not (isinstance(item, dict) and _optional_number(item.get("radius_m"))
            and _optional_number(item.get("gsd_mm_px"))):
        raise ValueError
    rel = _safe_relative(item.get("file"))
    return PhotoResult(folder.joinpath(*rel.parts), item.get("radius_m"), item.get("gsd_mm_px"))


def _parse_section(folder: Path, item) -> SectionResult:
    if not (isinstance(item, dict) and item.get("blade") in BLADES and item.get("face") in FACES
            and _is_int(item.get("width_px")) and item["width_px"] > 0
            and _is_int(item.get("height_px")) and item["height_px"] > 0
            and isinstance(item.get("direction", "unknown"), str)
            and isinstance(item.get("calibration"), (dict, type(None)))
            and isinstance(item.get("photos"), list)
            and isinstance(item.get("warnings", []), list)):
        raise ValueError
    rel = _safe_relative(item.get("strip"))
    return SectionResult(
        blade=item["blade"], face=item["face"], strip_path=folder.joinpath(*rel.parts),
        width_px=item["width_px"], height_px=item["height_px"],
        calibration=item.get("calibration") or {},
        photos=[_parse_photo(folder, p) for p in item["photos"]],
        direction=item.get("direction", "unknown"),
        warnings=[str(w) for w in item.get("warnings", [])])


def _named(paths: list[Path]) -> tuple[str, str]:
    names = ", ".join(p.name for p in paths[:MAX_NAMED])
    return names, f" (y {len(paths) - MAX_NAMED} más)" if len(paths) > MAX_NAMED else ""


def load_ready(folder: Path) -> ReadyInspection:
    """Lee y valida la inspección guardada de `folder`. Lanza ReadyError con un mensaje claro."""
    folder = Path(folder)
    if not folder.is_dir():
        raise ReadyError(NO_FOLDER.format(folder=folder))
    path = find_file(folder)
    if path is None:
        raise ReadyError(NO_FILE)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):  # UnicodeDecodeError y JSONDecodeError son ValueError
        raise ReadyError(CORRUPT.format(name=path.name)) from None
    if not isinstance(data, dict):
        raise ReadyError(CORRUPT.format(name=path.name))
    version = data.get("version")
    if _is_int(version) and version != VERSION:
        raise ReadyError(BAD_VERSION.format(version=version))
    try:
        if version != VERSION or not isinstance(data.get("turbine_name"), str):
            raise ValueError
        length = data.get("blade_length_m")
        sections_raw = data.get("sections")
        if not (_is_number(length) and length > 0 and isinstance(sections_raw, list) and sections_raw):
            raise ValueError
        status = data.get("status", STATUS_READY)
        if not isinstance(status, str):
            raise ValueError
        sections = [_parse_section(folder, s) for s in sections_raw]
    except ValueError:
        raise ReadyError(CORRUPT.format(name=path.name)) from None
    missing_strips = [s.strip_path for s in sections if not s.strip_path.is_file()]
    if missing_strips:
        names, more = _named(missing_strips)
        raise ReadyError(MISSING_STRIPS.format(names=names, more=more))
    missing_photos = [p.path for s in sections for p in s.photos if not p.path.is_file()]
    if missing_photos:
        names, more = _named(missing_photos)
        raise ReadyError(MISSING_PHOTOS.format(names=names, more=more))
    try:
        wtg = scan_wtg(folder)
    except OSError:
        raise ReadyError(NO_FOLDER.format(folder=folder)) from None
    for s in sections:  # el orden de las fotos de cada cara es el que se procesó (p. ej. si se invirtió)
        current = wtg.blades.get(s.blade, {}).get(s.face)
        saved = [p.path for p in s.photos]
        if current is not None and sorted(map(str, current)) == sorted(map(str, saved)):
            wtg.blades[s.blade][s.face] = saved
    return ReadyInspection(folder=folder, status=status, turbine_name=data["turbine_name"] or folder.name,
                           blade_length_m=float(length), sections=sections, wtg=wtg)
