"""python -m ingest_demo --folder <ruta> --project <uuid> --asset <uuid> --email <correo>

La contraseña se pide con getpass; para pruebas no interactivas se toma de NEXUS_PASSWORD.
La URL y la llave pública salen de NEXUS_SUPABASE_URL (por defecto, el Supabase local
en 127.0.0.1:54321) y NEXUS_PUBLISHABLE_KEY.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import shutil
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import ValidationError
from supabase import create_client

from .exif import num, read_exif
from .gsd import compute_gsd
from .manifest import build_manifest, object_prefix, validate
from . import mosaics, position, vnd_manifest
from .media import make_derivatives, sha256_file
from .upload import tus_upload

INDEX_NAME = ".ingest_index.json"
FACES = ("TE", "PS", "LE", "SS")
BLADE_DIR = re.compile(r"^(?:Pala|Blade)\s+([ABC])$", re.IGNORECASE)


def scan_folder(folder: Path) -> list[tuple[Path, str, str]]:
    """Devuelve (archivo, pala, cara) recorriendo `Pala|Blade {A,B,C}/{TE,PS,LE,SS}/*.jpg`."""
    found = []
    for bdir in sorted(p for p in folder.iterdir() if p.is_dir()):
        m = BLADE_DIR.match(bdir.name)
        if not m:
            continue
        for face in FACES:
            fdir = bdir / face
            if not fdir.is_dir():
                continue
            files = sorted(p for p in fdir.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg"))
            found += [(p, m.group(1).upper(), face) for p in files]
    return found


def load_index(folder: Path) -> dict:
    p = folder / INDEX_NAME
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"inspections": {}, "captures": {}}


def save_index(folder: Path, index: dict) -> None:
    (folder / INDEX_NAME).write_text(json.dumps(index, indent=2), encoding="utf-8")


def resolve_exiftool(arg: Path | None) -> Path:
    """--exiftool, luego NEXUS_EXIFTOOL, luego `exiftool` en el PATH."""
    if arg:
        return Path(arg)
    env = os.environ.get("NEXUS_EXIFTOOL")
    if env:
        return Path(env)
    found = shutil.which("exiftool")
    if not found:
        raise SystemExit("No se encontró exiftool: use --exiftool, NEXUS_EXIFTOOL o agréguelo al PATH.")
    return Path(found)


def dedupe_by_sha(items: list[tuple[Path, str, str]], sha_of=sha256_file) -> list[tuple[Path, str, str, str]]:
    """Conserva el primer archivo de cada sha256; avisa de los repetidos."""
    seen: dict[str, Path] = {}
    out = []
    for path, blade, face in items:
        sha = sha_of(path)
        if sha in seen:
            print(f"  omitida {path.name}: idéntica a {seen[sha].name}")
            continue
        seen[sha] = path
        out.append((path, blade, face, sha))
    return out


def exif_datetime(meta: dict) -> str | None:
    utc = meta.get("UTCAtExposure")
    if utc:
        try:
            return datetime.strptime(str(utc)[:19].replace("T", " ").replace("-", ":"), "%Y:%m:%d %H:%M:%S").replace(
                tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass
    raw = meta.get("DateTimeOriginal") or meta.get("CreateDate")
    if not raw:
        return None
    try:
        # La hora de la cámara no trae zona; se guarda como UTC (demostración).
        return datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def build_capture(path: Path, blade: str | None, face: str | None, seq: int, meta: dict, sha: str, cap_id: str,
                  prefix: str, deriv, vnd: vnd_manifest.VndPhoto | None = None) -> dict:
    base = f"{prefix}captures/{cap_id}/"
    gsd = compute_gsd(meta, deriv.width_px)
    lrf = num(meta.get("LRFTargetDistance"))
    lat, lon = num(meta.get("GPSLatitude")), num(meta.get("GPSLongitude"))
    if lat == 0 and lon == 0:  # sin fijación GPS
        lat = lon = None
    gsd_json = {"mm_px": gsd.mm_px, "source": gsd.source, "confidence": gsd.confidence} if gsd else None
    if gsd_json is None and vnd and vnd.gsd_mm_px:  # sin EXIF útil: GSD del manifiesto de VND
        gsd_json = {"mm_px": vnd.gsd_mm_px, "source": "manual", "confidence": "low"}
    blade_json = None  # la foto `_ID` no lleva datos de pala
    if blade and face:
        blade_json = {"position": blade, "face": face}
        if vnd and vnd.radius_m is not None:
            blade_json["radius_center_m"] = vnd.radius_m
        if vnd and vnd.sequence_direction:
            blade_json["sequence_direction"] = vnd.sequence_direction
    cap = {
        "id": cap_id, "sha256": sha, "spectrum": "rgb", "file_name": path.name, "sequence_index": seq,
        "paths": {"original": base + "original.jpg", "preview": base + "preview.webp", "thumb": base + "thumb.webp"},
        "width_px": deriv.width_px, "height_px": deriv.height_px,
        "captured_at": exif_datetime(meta),
        "gps": {"lat": lat, "lon": lon,
                "alt_abs_m": num(meta.get("GPSAltitude")), "alt_rel_m": num(meta.get("RelativeAltitude"))},
        "gimbal": {"pitch_deg": num(meta.get("GimbalPitchDegree")), "roll_deg": num(meta.get("GimbalRollDegree")),
                   "yaw_deg": num(meta.get("GimbalYawDegree"))},
        "camera_model": meta.get("Model"),
        "lrf_distance_m": lrf if lrf and lrf > 0 else None,
        "gsd": gsd_json,
    }
    if blade_json:
        cap["blade"] = blade_json
    return cap


def choose_inspection(explicit: str | None, indexed: str | None, indexed_exists: bool,
                      pending: str | None, new_id=lambda: str(uuid.uuid4())) -> tuple[str, bool]:
    """Decide qué inspección usar. Devuelve (id, hay_que_crearla).

    Orden: --inspection, el índice local (si la fila existe), la inspección `pending` del activo,
    o una nueva. La nueva reutiliza el id del índice si lo había (así coinciden las rutas ya subidas).
    """
    if explicit:
        return explicit.lower(), False
    if indexed and indexed_exists:
        return indexed, False
    if pending:
        return pending, False
    return indexed or new_id(), True


def resolve_inspection(sb, args, index, folder: Path) -> str:
    """Resuelve la inspección y, si es nueva, crea la fila antes de subir (§8.1 paso 3):
    la política de Storage exige que la inspección exista."""
    indexed = index["inspections"].get(args.asset)
    indexed_exists = False
    if indexed and not args.inspection:
        indexed_exists = bool(sb.table("inspections").select("id").eq("id", indexed).limit(1).execute().data)
    pending = None
    if not args.inspection and not indexed_exists:
        rows = (sb.table("inspections").select("id").eq("project_id", args.project).eq("asset_id", args.asset)
                .eq("status", "pending").order("created_at").limit(1).execute().data)
        pending = rows[0]["id"] if rows else None
    insp, create = choose_inspection(args.inspection, indexed, indexed_exists, pending)
    if create:
        sb.table("inspections").insert({"id": insp, "project_id": args.project, "asset_id": args.asset,
                                        "kind": "wind_blade", "status": "captured"}).execute()
        print(f"  inspección nueva creada: {insp}")
    if not args.inspection:
        index["inspections"][args.asset] = insp
        save_index(folder, index)
    return insp


REFRESH_MARGIN_S = 300


def fresh_token(auth, margin_s: int = REFRESH_MARGIN_S, now=time.time) -> str:
    """Token de acceso vigente; renueva la sesión si vence en menos de `margin_s` segundos.
    Nunca se imprime."""
    session = auth.get_session()
    if session is None:
        raise SystemExit("Sesión perdida: vuelva a iniciar sesión.")
    if session.expires_at is not None and session.expires_at - now() < margin_s:
        session = auth.refresh_session(session.refresh_token).session
    return session.access_token


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="ingest_demo")
    ap.add_argument("--folder", required=True, type=Path)
    ap.add_argument("--project", required=True)
    ap.add_argument("--asset", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--inspection", help="id de una inspección existente (opcional)")
    ap.add_argument("--exiftool", type=Path, help="si falta: NEXUS_EXIFTOOL o exiftool en el PATH")
    args = ap.parse_args(argv)
    args.project, args.asset = args.project.lower(), args.asset.lower()

    url = os.environ.get("NEXUS_SUPABASE_URL", "http://127.0.0.1:54321")
    key = os.environ.get("NEXUS_PUBLISHABLE_KEY")
    if not key:
        print("Falta NEXUS_PUBLISHABLE_KEY (llave pública; `npx supabase status -o env`).", file=sys.stderr)
        return 2
    password = os.environ.get("NEXUS_PASSWORD") or getpass.getpass(f"Contraseña de {args.email}: ")

    exiftool = resolve_exiftool(args.exiftool)
    files = scan_folder(args.folder)
    if not files:
        print("No se encontraron fotos en Pala|Blade {A,B,C}/{TE,PS,LE,SS}/*.jpg", file=sys.stderr)
        return 2

    sb = create_client(url, key)
    sb.auth.sign_in_with_password({"email": args.email, "password": password})

    proj = sb.table("projects").select("organization_id").eq("id", args.project).limit(1).execute().data
    if not proj:
        print("Proyecto no visible para este usuario.", file=sys.stderr)
        return 1
    org = proj[0]["organization_id"]

    index = load_index(args.folder)
    insp_id = resolve_inspection(sb, args, index, args.folder)
    prefix = object_prefix(org, args.project, insp_id)
    vnd = vnd_manifest.load(args.folder)
    blade_length = vnd_manifest.blade_length_m(args.folder)
    captures: list[dict] = []
    mosaic_list: list[dict] = []
    seq_by_group: dict[tuple, int] = {}

    def upload(src: Path, name: str, content_type: str) -> None:
        # Se renueva el token antes de cada subida para corridas largas
        tus_upload(src, name, content_type, supabase_url=url, access_token=fresh_token(sb.auth),
                   publishable_key=key)

    id_photo = position.find_id_photo(args.folder)
    if id_photo:
        files.append((id_photo, None, None))  # captura RGB sin bloque `blade`
    files = dedupe_by_sha(files)
    id_cap_id = None
    id_pos = None
    try:
      with tempfile.TemporaryDirectory() as tmp:
        for path, blade, face, sha in files:
            cap_id = index["captures"].setdefault(sha, str(uuid.uuid4()))
            meta = read_exif(path, exiftool)
            deriv = make_derivatives(path, Path(tmp) / cap_id)
            seq = seq_by_group.get((blade, face), 0)
            seq_by_group[(blade, face)] = seq + 1
            cap = build_capture(path, blade, face, seq, meta, sha, cap_id, prefix, deriv,
                                vnd.get(path.name) if blade else None)
            if path == id_photo:
                id_cap_id, id_pos = cap_id, position.turbine_position(meta)
            upload(path, cap["paths"]["original"], "image/jpeg")
            upload(deriv.preview, cap["paths"]["preview"], "image/webp")
            upload(deriv.thumb, cap["paths"]["thumb"], "image/webp")
            captures.append(cap)
            save_index(args.folder, index)
            gsd = cap["gsd"]["mm_px"] if cap["gsd"] else None
            where = f"{blade}/{face}" if blade else "_ID"
            print(f"  subida {path.name} ({where}) gsd_mm_px={gsd and round(gsd, 4)}")

        index.setdefault("mosaics", {})
        for strip in mosaics.scan(args.folder):
            mid = index["mosaics"].setdefault(strip.path.name, str(uuid.uuid4()))
            out = Path(tmp) / f"strip_{mid}.webp"
            w, h = mosaics.make_strip(strip.path, out)
            mosaic = mosaics.build_mosaic(strip, mid, prefix, w, h)
            upload(out, mosaic["path"], "image/webp")
            mosaic_list.append(mosaic)
            save_index(args.folder, index)
            print(f"  subida tira {strip.path.name} ({strip.blade}/{strip.face}) {w}x{h}")

    finally:
        save_index(args.folder, index)
    inspection = {"id": insp_id, "asset_id": args.asset, "kind": "wind_blade"}
    if blade_length:
        inspection["blade_length_m"] = blade_length
    if id_cap_id:
        inspection["id_capture_id"] = id_cap_id
    manifest = build_manifest(args.project, inspection, captures)
    if mosaic_list:
        manifest["mosaics"] = mosaic_list
    try:
        validate(manifest)
    except ValidationError as e:
        print(f"Manifiesto inválido: {e.message}", file=sys.stderr)
        return 1
    try:
        res = sb.rpc("ingest_manifest", {"p_manifest": manifest}).execute()
    except Exception as e:  # postgrest.APIError
        detail = getattr(e, "details", None) or getattr(e, "message", None) or str(e)
        print(f"ingest_manifest rechazó el manifiesto: {detail}", file=sys.stderr)
        return 1
    print(json.dumps(res.data, indent=2, ensure_ascii=False))
    if id_pos:
        lat, lon, source = id_pos
        try:
            sb.table("inspections").update({"asset_lat": lat, "asset_lon": lon, "asset_position_source": source})                 .eq("id", insp_id).execute()
        except Exception as e:
            detail = getattr(e, "details", None) or getattr(e, "message", None) or str(e)
            print(f"No se pudo guardar la posición: {detail}", file=sys.stderr)
            return 1
        print(f"  posición de la turbina: {lat}, {lon} ({source})")
    elif id_photo:
        print("  la foto _ID no tiene láser ni GPS válidos: sin posición")
    else:
        print("  sin carpeta *_ID: sin posición")
    return 0
