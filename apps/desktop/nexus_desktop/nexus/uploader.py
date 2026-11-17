"""Orquestador de subida reanudable e idempotente (§8 del diseño).

Por pala: sube las fotos (original, preview y miniatura) y sus tiras, y llama a
`ingest_manifest` con el manifiesto de esa pala. La foto `_ID` va en el primer manifiesto
(o, si no hay palas, en un manifiesto solo con ella). Lo ya subido (según el índice local)
no se vuelve a subir; repetir es seguro.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from jsonschema import ValidationError
from PIL import Image, UnidentifiedImageError

from .. import config
from ..domain import mosaics
from ..domain.exif import read_exif
from ..domain.media import make_derivatives, sha256_file
from ..domain.position import turbine_position
from ..domain.wtg_folder import FACES, WtgFolder
from ..storage.local_index import LocalIndex
from .builder import build_blade_manifest, build_calibration, build_capture, scale_row
from .manifest import build_manifest, object_prefix, validate
from .projects import KIND, Asset, Project, resolve_inspection
from .upload import tus_upload

Progress = Callable[[str, float], None]

# Fallos de UN archivo (se omite y se sigue; exiftool colgado, TimeoutExpired, también, con su
# propio aviso). Falta de exiftool (FileNotFoundError al lanzarlo), fallos al escribir temporales
# y errores de programación NO están aquí: se propagan.
_EXIF_FILE_ERRORS = (subprocess.CalledProcessError, ValueError, IndexError)  # ValueError incluye JSONDecodeError
_SOURCE_ERRORS = (UnidentifiedImageError, Image.DecompressionBombError, OSError)  # al leer la foto de ORIGEN
POSITION_NOT_SAVED = "No se pudo guardar la posición de la turbina; reintenta la subida."


@dataclass
class PhotoInfo:
    radius_m: float | None
    direction: str | None


@dataclass
class StripInput:
    """Tira unida de una cara. `calibration` (forma de `builder.build_calibration`) va en píxeles
    de la tira ORIGINAL de `path`; el orquestador la lleva al tamaño subido."""
    blade: str
    face: str
    path: Path
    calibration: dict | None


@dataclass
class UploadPlan:
    folder: WtgFolder
    project: Project  # la organización sale de project.organization_id
    asset: Asset
    blade_length_m: float | None
    strips: list[StripInput]
    photo_info: dict[Path, PhotoInfo] = field(default_factory=dict)


@dataclass
class UploadReport:
    """Suma de las respuestas de `ingest_manifest` de cada pala.

    `skipped["local_files"]`: nombres de fotos y tiras omitidas por estar dañadas o ilegibles.
    `errors`: `{"path", "code"}`, más `"blade"` si viene del manifiesto de una pala y `"file"`
    (nombre de la foto o tira local) si el puntero `path` señala una captura o un mosaico del
    manifiesto. Códigos locales además de los del servidor: `unknown`, `schema_invalid`,
    `no_valid_photos`, `nothing_to_upload`. Con errores, la subida NO debe presentarse como correcta.
    `warnings`: avisos que no son errores del manifiesto. `retryable_warnings` es la parte de
    `warnings` que reintentar puede arreglar (la posición de la turbina no se guardó): esa subida no
    se presenta como completa. Los demás avisos son permanentes (carpeta sin `_ID`, `_ID` sin láser
    ni GPS): la subida está completa y el aviso es solo una nota."""
    inserted: dict
    updated: dict
    skipped: dict
    errors: list[dict]
    cancelled: bool = False
    warnings: list[str] = field(default_factory=list)
    retryable_warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class _Photo:
    path: Path
    blade: str | None
    face: str | None
    sha: str


@dataclass(frozen=True)
class _Size:
    """Lo único que `build_capture` usa de los derivados."""
    width_px: int
    height_px: int


class _Cancelled(Exception):
    pass


def _photo_list(folder: WtgFolder) -> list[tuple[Path, str | None, str | None]]:
    out: list[tuple[Path, str | None, str | None]] = []
    for blade in sorted(folder.blades):
        faces = folder.blades[blade]
        out += [(p, blade, face) for face in FACES for p in faces.get(face, [])]
    if folder.id_photo is not None:
        out.append((folder.id_photo, None, None))  # al final: si se repite, gana la foto de pala
    return out


def _parse_details(details) -> list[dict] | None:
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except ValueError:
            return None
    if not isinstance(details, list) or not details:
        return None
    out = []
    for item in details:
        if not (isinstance(item, dict) and isinstance(item.get("path"), str) and isinstance(item.get("code"), str)):
            return None
        out.append({"path": item["path"], "code": item["code"]})
    return out


def ingest_errors(exc: Exception) -> list[dict]:
    """Errores `manifest_invalid` de PostgREST -> [{"path", "code"}]; cualquier otra forma, un
    único error con code "unknown"."""
    if getattr(exc, "message", None) == "manifest_invalid":
        parsed = _parse_details(getattr(exc, "details", None))
        if parsed:
            return parsed
    return [{"path": "", "code": "unknown"}]


def resolve_pointer(doc, pointer: str):
    """Valor del puntero JSON (RFC 6901) `pointer` en `doc`, o None si no existe. Los punteros de
    `ingest_manifest` se arman con las posiciones del manifiesto enviado (/captures/N/paths/original,
    /captures/N/thermal/matrix_path, /mosaics/N/path…)."""
    if not isinstance(pointer, str) or not pointer.startswith("/"):
        return None
    node = doc
    for token in pointer[1:].split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict):
            if token not in node:
                return None
            node = node[token]
        elif isinstance(node, list):
            if not token.isdigit() or int(token) >= len(node):
                return None
            node = node[int(token)]
        else:
            return None
    return node


def _scaled_calibration(cal: dict, original_h: int, uploaded_h: int) -> dict:
    def row(v):
        return None if v is None else scale_row(v, original_h, uploaded_h)

    mm = cal.get("mm_per_px")
    return build_calibration(row(cal.get("tip_row_px")), row(cal.get("root_row_px")), cal.get("blade_length_m"),
                             None if mm is None else mm * original_h / uploaded_h, cal.get("root_at_top"))


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _merge(report: UploadReport, data) -> None:
    if not isinstance(data, dict):
        return
    for name in ("inserted", "updated"):
        target = getattr(report, name)
        for k, v in (data.get(name) or {}).items():
            if _is_number(v):
                target[k] = target.get(k, 0) + v
    for k, v in (data.get("skipped") or {}).items():
        if isinstance(v, list):
            report.skipped.setdefault(k, []).extend(v)
        elif _is_number(v):
            report.skipped[k] = report.skipped.get(k, 0) + v


class _Run:
    """Estado de una corrida de `upload_inspection`."""

    def __init__(self, plan: UploadPlan, session, index: LocalIndex, exiftool: Path, progress: Progress,
                 cancel: threading.Event, send_fn: Callable, url: str, key: str) -> None:
        self.plan, self.session, self.index, self.exiftool = plan, session, index, exiftool
        self.progress, self.cancel, self.send_fn, self.url, self.key = progress, cancel, send_fn, url, key
        self.report = UploadReport({}, {}, {}, [])
        self.done, self.total = 0, 1
        self.seq_by_group: dict[tuple, int] = {}
        self.id_photo: _Photo | None = None
        self.id_read = False  # se leyó el EXIF de la foto _ID
        self.id_pos: tuple[float, float, str] | None = None
        self.n_captures = 0
        self.strip_names: dict[str, str] = {}  # ruta del mosaico en Storage -> nombre de la tira local
        self.insp_id = ""
        self.prefix = ""
        self.tmp = Path()

    # --- avisos -------------------------------------------------------------------------------
    def say(self, msg: str) -> None:
        self.progress(msg, min(self.done / self.total, 1.0))

    def step(self, msg: str) -> None:
        self.done += 1
        self.say(msg)

    def skip_file(self, name: str, msg: str, *, count: bool = True) -> None:
        self.report.skipped.setdefault("local_files", []).append(name)
        if count:
            self.step(msg)
        else:
            self.say(msg)

    def scratch(self, suffix: str = "") -> Path:
        """Ruta temporal nueva dentro de `self.tmp`. Nunca sale de datos del índice local (un id
        manipulado podría señalar otra carpeta, que luego se borraría al limpiar)."""
        return self.tmp / f"{uuid.uuid4().hex}{suffix}"

    def check_cancel(self) -> None:
        if self.cancel.is_set():
            raise _Cancelled

    def send(self, src: Path, name: str, content_type: str, sha256: str | None = None) -> None:
        # El token se pide antes de cada subida (corridas largas); nunca se muestra.
        self.send_fn(src, name, content_type, supabase_url=self.url, access_token=self.session.access_token(),
                     publishable_key=self.key)
        self.index.mark_uploaded(name, sha256)

    # --- pasos --------------------------------------------------------------------------------
    def hash_photos(self, candidates: list[tuple[Path, str | None, str | None]]) -> list[_Photo]:
        """Huellas: cada archivo idéntico se sube una sola vez."""
        self.say("Calculando huellas de las fotos…")
        photos: list[_Photo] = []
        seen: dict[str, Path] = {}
        for path, blade, face in candidates:
            self.check_cancel()
            try:
                sha = sha256_file(path)
            except OSError:  # la foto de origen no se puede leer
                self.skip_file(path.name, f"Foto omitida (no se pudo leer): {path.name}", count=False)
                continue
            if sha in seen:
                self.say(f"Foto omitida {path.name}: idéntica a {seen[sha].name}")
                continue
            seen[sha] = path
            photos.append(_Photo(path, blade, face, sha))
        return photos

    def upload_photo(self, ph: _Photo) -> dict | None:
        """Sube una foto. Solo los fallos de ESTE archivo (EXIF ilegible, imagen dañada) la omiten;
        los del entorno (falta exiftool, disco lleno) y los errores de programación se propagan."""
        info = self.plan.photo_info.get(ph.path) if ph.blade else None
        group = (ph.blade, ph.face)
        seq = self.seq_by_group.get(group, 0)
        cap_id = self.index.capture_id(ph.sha)
        bad = f"Foto omitida (dañada o ilegible): {ph.path.name}"
        try:
            meta = read_exif(ph.path, self.exiftool)
        except subprocess.TimeoutExpired:
            self.skip_file(ph.path.name, f"Foto omitida (exiftool no respondió a tiempo): {ph.path.name}")
            return None
        except _EXIF_FILE_ERRORS:
            self.skip_file(ph.path.name, bad)
            return None
        try:
            im = Image.open(ph.path)
        except _SOURCE_ERRORS:
            self.skip_file(ph.path.name, bad)
            return None
        with im:
            size = _Size(*im.size)  # tamaño del original, como make_derivatives
            cap = build_capture(ph.path, ph.blade, ph.face, seq, meta, ph.sha, cap_id, self.prefix, size,
                                info.radius_m if info else None, info.direction if info else None)
            pending = [k for k in ("original", "preview", "thumb") if not self.index.is_uploaded(cap["paths"][k])]
            need_deriv = bool({"preview", "thumb"} & set(pending))
            if need_deriv:
                try:
                    im.load()  # decodifica entera: una foto truncada falla aquí y no al escribir derivados
                except _SOURCE_ERRORS:
                    self.skip_file(ph.path.name, bad)
                    return None
        self.seq_by_group[group] = seq + 1
        self.n_captures += 1
        if ph is self.id_photo:
            self.id_read = True
            self.id_pos = turbine_position(meta)
        work = self.scratch()
        try:
            if pending:
                self.index.save()  # ids nuevos en disco antes de subir
                sources = {"original": (ph.path, "image/jpeg")}
                if need_deriv:
                    deriv = make_derivatives(ph.path, work)
                    sources |= {"preview": (deriv.preview, "image/webp"), "thumb": (deriv.thumb, "image/webp")}
                for k in pending:
                    src, ctype = sources[k]
                    self.send(src, cap["paths"][k], ctype)
                self.index.save()
        finally:
            shutil.rmtree(work, ignore_errors=True)
        where = f"{ph.blade}/{ph.face}" if ph.blade else "_ID"
        self.step(f"{'Subida' if pending else 'Ya subida'}: {ph.path.name} ({where})")
        return cap

    def upload_strip(self, strip: StripInput) -> dict | None:
        try:
            with Image.open(strip.path) as im:
                im.load()  # la tira de origen se lee entera; un fallo aquí es de este archivo
                original_h = im.size[1]
            # Reprocesar reescribe la tira con el MISMO nombre (mismo id y misma ruta en Storage): la
            # huella decide si el objeto subido sigue siendo esta tira o hay que reenviarla.
            sha = sha256_file(strip.path)
        except _SOURCE_ERRORS:
            self.skip_file(strip.path.name, f"Tira omitida (dañada o ilegible): {strip.path.name}")
            return None
        mid = self.index.mosaic_id(strip.path.name)
        out = self.scratch(".webp")
        try:
            w, h = mosaics.make_strip(strip.path, out)  # fallos al escribir el temporal se propagan
            mosaic = mosaics.build_mosaic(mosaics.StripFile(strip.path, strip.blade, strip.face), mid, self.prefix,
                                          w, h)
            self.strip_names[mosaic["path"]] = strip.path.name
            if strip.calibration is not None:
                mosaic["calibration"] = _scaled_calibration(strip.calibration, original_h, h)
            uploaded = self.index.is_uploaded(mosaic["path"], sha)
            if not uploaded:
                self.index.save()
                self.send(out, mosaic["path"], "image/webp", sha)  # x-upsert: reemplaza la anterior
                self.index.save()
        finally:
            out.unlink(missing_ok=True)
        self.step(f"{'Ya subida' if uploaded else 'Subida'}: tira {strip.path.name} ({strip.blade}/{strip.face})")
        return mosaic

    def inspection(self, captures: list[dict]) -> dict:
        insp = {"id": self.insp_id, "asset_id": self.plan.asset.id, "kind": KIND}
        if self.plan.blade_length_m:
            insp["blade_length_m"] = self.plan.blade_length_m
        id_cap = next((c for c in captures if "blade" not in c), None)
        if id_cap is not None:
            insp["id_capture_id"] = id_cap["id"]
        return insp

    def ingest(self, blade: str | None, captures: list[dict], mosaic_list: list[dict]) -> None:
        """Un manifiesto: el de una pala o, con `blade=None`, solo la foto _ID."""
        report, project_id = self.report, self.plan.project.id
        label = f"la pala {blade}" if blade else "la foto _ID"
        tag = {"blade": blade} if blade else {}
        inspection = self.inspection(captures)
        try:
            if blade:
                manifest = build_blade_manifest(project_id, inspection, blade, captures, mosaic_list)
            else:
                manifest = build_manifest(project_id, inspection, captures, mosaics=mosaic_list)
                validate(manifest)
        except ValidationError as e:
            report.errors.append({"path": "/" + "/".join(str(x) for x in e.absolute_path), "code": "schema_invalid",
                                  **tag})
            self.say(f"El manifiesto de {label} no cumple el esquema; no se registró.")
            return
        self.say(f"Registrando {label} en NEXUS…")
        self.session.access_token()  # sesión vigente (renueva si hace falta); SessionLost se propaga
        try:
            res = self.session.client.rpc("ingest_manifest", {"p_manifest": manifest}).execute()
        except Exception as e:  # postgrest.APIError u otro fallo del servidor
            errs = [self.describe_error(err, manifest) | tag for err in ingest_errors(e)]
            report.errors.extend(errs)
            self.forget_missing(errs, manifest)
            self.say(f"El servidor rechazó {label} ({len(errs)} error(es)).")
            return
        _merge(report, res.data)
        self.say(f"Registrada {label}.")

    def describe_error(self, err: dict, manifest: dict) -> dict:
        """Añade `file` (foto o tira local) si el puntero del error señala una captura o un mosaico."""
        parts = err.get("path", "").split("/")
        if len(parts) < 3 or parts[1] not in ("captures", "mosaics"):
            return err
        item = resolve_pointer(manifest, f"/{parts[1]}/{parts[2]}")
        if not isinstance(item, dict):
            return err
        name = item.get("file_name") if parts[1] == "captures" else self.strip_names.get(item.get("path"))
        return err | {"file": name} if isinstance(name, str) and name else err

    def forget_missing(self, errs: list[dict], manifest: dict) -> None:
        """`missing_object`: el objeto no está en Storage aunque el índice lo diera por subido (p. ej. lo
        borró un administrador). Se quita del índice para que el próximo intento lo vuelva a enviar."""
        lost = [resolve_pointer(manifest, e["path"]) for e in errs if e.get("code") == "missing_object"]
        lost = [p for p in lost if isinstance(p, str) and p]
        for path in lost:
            self.index.unmark_uploaded(path)
        if lost:
            self.index.save()
            self.say(f"{len(lost)} archivo(s) no estaban en NEXUS: se volverán a enviar al reintentar.")

    def save_position(self) -> None:
        """Posición de la turbina (foto `_ID`) en `inspections`, tras los manifiestos."""
        if self.id_pos:
            lat, lon, source = self.id_pos
            self.session.access_token()  # SessionLost se propaga
            try:
                (self.session.client.table("inspections")
                 .update({"asset_lat": lat, "asset_lon": lon, "asset_position_source": source})
                 .eq("id", self.insp_id).execute())
                self.say(f"Posición de la turbina: {lat}, {lon} ({source}).")
            except Exception:
                self.warn(POSITION_NOT_SAVED, retryable=True)
        elif self.id_read:
            self.warn("La foto _ID no tiene láser ni GPS válidos: sin posición de la turbina.")
        elif self.id_photo is not None:
            self.warn("La foto _ID no se pudo leer: sin posición de la turbina.")
        else:
            self.warn("Sin foto _ID: sin posición de la turbina.")

    def warn(self, msg: str, *, retryable: bool = False) -> None:
        self.report.warnings.append(msg)
        if retryable:
            self.report.retryable_warnings.append(msg)
        self.say(msg)

    def upload_all(self) -> None:
        plan = self.plan
        candidates = _photo_list(plan.folder)
        if not candidates:
            self.report.errors.append({"path": "", "code": "nothing_to_upload"})
            self.say("No hay fotos para subir en esta carpeta (ni de palas ni _ID).")
            return
        photos = self.hash_photos(candidates)
        self.id_photo = next((p for p in photos if p.blade is None), None)
        self.total = max(1, len(photos) + len(plan.strips))
        blades = sorted({p.blade for p in photos if p.blade} | {s.blade for s in plan.strips})
        id_pending = self.id_photo is not None

        for blade in blades:  # una pala a la vez: fotos -> tiras -> manifiesto
            group = [p for p in photos if p.blade == blade]
            if id_pending:  # la _ID va con la primera pala (se intenta una sola vez)
                group = [self.id_photo] + group
                id_pending = False
            captures = []
            for ph in group:
                self.check_cancel()
                cap = self.upload_photo(ph)
                if cap is not None:
                    captures.append(cap)
            strips = [s for s in plan.strips if s.blade == blade]
            if not captures:
                if strips:
                    self.done += len(strips)
                    self.say(f"La pala {blade} está sin fotos: sus tiras no se suben.")
                continue
            mosaic_list = []
            for strip in strips:
                self.check_cancel()
                mosaic = self.upload_strip(strip)
                if mosaic is not None:
                    mosaic_list.append(mosaic)
            self.check_cancel()
            self.ingest(blade, captures, mosaic_list)

        if id_pending:  # sin palas: manifiesto solo con la _ID, como la herramienta anterior
            self.check_cancel()
            cap = self.upload_photo(self.id_photo)
            if cap is not None:
                self.check_cancel()
                self.ingest(None, [cap], [])

        if self.n_captures == 0:
            self.report.errors.append({"path": "", "code": "no_valid_photos"})
            self.say("Ninguna foto se pudo leer: no se registró nada en NEXUS.")
        self.save_position()

    def run(self) -> UploadReport:
        plan, index = self.plan, self.index
        if index.load_warning:
            self.say(index.load_warning)
        project = plan.project
        self.insp_id = resolve_inspection(self.session.client, project.id, plan.asset.id, index)
        self.prefix = object_prefix(project.organization_id, project.id, self.insp_id)
        try:
            with tempfile.TemporaryDirectory(prefix="nexus_upload_") as tmp_dir:
                self.tmp = Path(tmp_dir)
                self.upload_all()
                self.done = self.total
                self.say("Subida terminada con errores." if self.report.errors else "Subida terminada.")
        except _Cancelled:
            self.report.cancelled = True
            self.say("Subida cancelada; lo ya subido queda guardado para continuar después.")
        finally:
            index.save()
        return self.report


def upload_inspection(plan: UploadPlan, session, index: LocalIndex, exiftool: Path, progress: Progress,
                      cancel: threading.Event, *, tus: Callable | None = None, supabase_url: str | None = None,
                      publishable_key: str | None = None) -> UploadReport:
    """Sube la carpeta WTG y registra un manifiesto por pala.

    `progress(mensaje, fracción 0..1)` recibe avisos en español (nunca el token). Propaga
    `SessionLost` (con el índice guardado), `InspectionLocked` e `InspectionError`. Con `cancel`
    activo termina el archivo en curso y devuelve el reporte parcial (`cancelled=True`), sin llamar
    a `ingest_manifest` para las palas sin terminar. `tus`, `supabase_url` y `publishable_key`
    existen para las pruebas; por omisión, `upload.tus_upload` y `config`."""
    key = config.SUPABASE_PUBLISHABLE_KEY if publishable_key is None else publishable_key
    return _Run(plan, session, index, exiftool, progress, cancel, tus or tus_upload,
                supabase_url or config.SUPABASE_URL, key).run()
