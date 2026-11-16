"""Orquestador de subida reanudable e idempotente (§8 del diseño).

Por pala: sube las fotos (original, preview y miniatura) y sus tiras, y llama a
`ingest_manifest` con el manifiesto de esa pala. La foto `_ID` va en el primer manifiesto.
Lo ya subido (según el índice local) no se vuelve a subir; repetir es seguro.
"""
from __future__ import annotations

import json
import shutil
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from jsonschema import ValidationError
from PIL import Image

from .. import config
from ..domain import mosaics
from ..domain.exif import read_exif
from ..domain.media import make_derivatives, sha256_file
from ..domain.position import turbine_position
from ..domain.wtg_folder import FACES, WtgFolder
from ..storage.local_index import LocalIndex
from .builder import build_blade_manifest, build_calibration, build_capture, scale_row
from .manifest import object_prefix
from .projects import KIND, Asset, Project, resolve_inspection
from .upload import tus_upload

Progress = Callable[[str, float], None]


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
    """Suma de las respuestas de `ingest_manifest` de cada pala."""
    inserted: dict
    updated: dict
    skipped: dict
    errors: list[dict]  # [{"path", "code"}]
    cancelled: bool = False


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
        self.id_pos: tuple[float, float, str] | None = None
        self.prefix = ""
        self.tmp = Path()

    # --- avisos -------------------------------------------------------------------------------
    def say(self, msg: str) -> None:
        self.progress(msg, min(self.done / self.total, 1.0))

    def step(self, msg: str) -> None:
        self.done += 1
        self.say(msg)

    def check_cancel(self) -> None:
        if self.cancel.is_set():
            raise _Cancelled

    def send(self, src: Path, name: str, content_type: str) -> None:
        # El token se pide antes de cada subida (corridas largas); nunca se muestra.
        self.send_fn(src, name, content_type, supabase_url=self.url, access_token=self.session.access_token(),
                     publishable_key=self.key)
        self.index.mark_uploaded(name)

    # --- pasos --------------------------------------------------------------------------------
    def hash_photos(self) -> list[_Photo]:
        """Huellas: cada archivo idéntico se sube una sola vez."""
        self.say("Calculando huellas de las fotos…")
        photos: list[_Photo] = []
        seen: dict[str, Path] = {}
        for path, blade, face in _photo_list(self.plan.folder):
            self.check_cancel()
            try:
                sha = sha256_file(path)
            except OSError:
                self.say(f"Foto omitida (no se pudo leer): {path.name}")
                continue
            if sha in seen:
                self.say(f"Foto omitida {path.name}: idéntica a {seen[sha].name}")
                continue
            seen[sha] = path
            photos.append(_Photo(path, blade, face, sha))
        return photos

    def upload_photo(self, ph: _Photo) -> dict | None:
        info = self.plan.photo_info.get(ph.path) if ph.blade else None
        group = (ph.blade, ph.face)
        seq = self.seq_by_group.get(group, 0)
        cap_id = self.index.capture_id(ph.sha)
        work = self.tmp / cap_id
        try:
            meta = read_exif(ph.path, self.exiftool)
            with Image.open(ph.path) as im:
                size = _Size(*im.size)  # tamaño del original, como make_derivatives
            cap = build_capture(ph.path, ph.blade, ph.face, seq, meta, ph.sha, cap_id, self.prefix, size,
                                info.radius_m if info else None, info.direction if info else None)
            pending = [k for k in ("original", "preview", "thumb") if not self.index.is_uploaded(cap["paths"][k])]
            deriv = make_derivatives(ph.path, work) if {"preview", "thumb"} & set(pending) else None
        except Exception:  # archivo dañado o ilegible: se avisa y se sigue
            shutil.rmtree(work, ignore_errors=True)
            self.step(f"Foto omitida (dañada o ilegible): {ph.path.name}")
            return None
        self.seq_by_group[group] = seq + 1
        if ph is self.id_photo:
            self.id_pos = turbine_position(meta)
        try:
            if pending:
                self.index.save()  # ids nuevos en disco antes de subir
                sources = {"original": (ph.path, "image/jpeg")}
                if deriv is not None:
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
        mid = self.index.mosaic_id(strip.path.name)
        out = self.tmp / f"strip_{mid}.webp"
        try:
            with Image.open(strip.path) as im:
                original_h = im.size[1]
            w, h = mosaics.make_strip(strip.path, out)
        except Exception:
            out.unlink(missing_ok=True)
            self.step(f"Tira omitida (dañada o ilegible): {strip.path.name}")
            return None
        mosaic = mosaics.build_mosaic(mosaics.StripFile(strip.path, strip.blade, strip.face), mid, self.prefix, w, h)
        if strip.calibration is not None:
            mosaic["calibration"] = _scaled_calibration(strip.calibration, original_h, h)
        uploaded = self.index.is_uploaded(mosaic["path"])
        try:
            if not uploaded:
                self.index.save()
                self.send(out, mosaic["path"], "image/webp")
                self.index.save()
        finally:
            out.unlink(missing_ok=True)
        self.step(f"{'Ya subida' if uploaded else 'Subida'}: tira {strip.path.name} ({strip.blade}/{strip.face})")
        return mosaic

    def ingest(self, blade: str, inspection: dict, captures: list[dict], mosaic_list: list[dict]) -> None:
        client, report = self.session.client, self.report
        try:
            manifest = build_blade_manifest(self.plan.project.id, inspection, blade, captures, mosaic_list)
        except ValidationError as e:
            report.errors.append({"path": "/" + "/".join(str(x) for x in e.absolute_path), "code": "schema_invalid"})
            self.say(f"El manifiesto de la pala {blade} no cumple el esquema; no se registró.")
            return
        self.say(f"Registrando la pala {blade} en NEXUS…")
        try:
            res = client.rpc("ingest_manifest", {"p_manifest": manifest}).execute()
        except Exception as e:  # postgrest.APIError u otro fallo del servidor
            errs = ingest_errors(e)
            report.errors.extend(errs)
            self.say(f"El servidor rechazó la pala {blade} ({len(errs)} error(es)).")
            return
        _merge(report, res.data)
        self.say(f"Pala {blade} registrada.")

    def save_position(self, insp_id: str) -> None:
        """Posición de la turbina (foto `_ID`) en `inspections`, tras los manifiestos."""
        if self.id_pos:
            lat, lon, source = self.id_pos
            try:
                (self.session.client.table("inspections")
                 .update({"asset_lat": lat, "asset_lon": lon, "asset_position_source": source})
                 .eq("id", insp_id).execute())
                self.say(f"Posición de la turbina: {lat}, {lon} ({source}).")
            except Exception:
                self.say("No se pudo guardar la posición de la turbina.")
        elif self.id_photo is not None:
            self.say("La foto _ID no tiene láser ni GPS válidos: sin posición.")
        else:
            self.say("Sin foto _ID: sin posición de la turbina.")

    def run(self) -> UploadReport:
        plan, index = self.plan, self.index
        if index.load_warning:
            self.say(index.load_warning)
        project, asset = plan.project, plan.asset
        insp_id = resolve_inspection(self.session.client, project.id, asset.id, index)
        self.prefix = object_prefix(project.organization_id, project.id, insp_id)
        try:
            with tempfile.TemporaryDirectory(prefix="nexus_upload_") as tmp_dir:
                self.tmp = Path(tmp_dir)
                photos = self.hash_photos()
                self.id_photo = next((p for p in photos if p.blade is None), None)
                self.total = max(1, len(photos) + len(plan.strips))
                blades = sorted({p.blade for p in photos if p.blade} | {s.blade for s in plan.strips})
                id_pending = self.id_photo is not None

                for blade in blades:  # una pala a la vez: fotos -> tiras -> manifiesto
                    group = [p for p in photos if p.blade == blade]
                    with_id = id_pending and bool(group)
                    if with_id:
                        group = [self.id_photo] + group
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

                    inspection = {"id": insp_id, "asset_id": asset.id, "kind": KIND}
                    if plan.blade_length_m:
                        inspection["blade_length_m"] = plan.blade_length_m
                    id_cap = next((c for c in captures if "blade" not in c), None)
                    if id_cap is not None:
                        inspection["id_capture_id"] = id_cap["id"]
                    if with_id:
                        id_pending = False
                    self.ingest(blade, inspection, captures, mosaic_list)

                self.save_position(insp_id)
                self.done = self.total
                self.say("Subida terminada.")
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
