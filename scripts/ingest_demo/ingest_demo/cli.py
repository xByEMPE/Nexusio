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
import uuid
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import ValidationError
from supabase import create_client

from .exif import num, read_exif
from .gsd import compute_gsd
from .manifest import build_manifest, object_prefix, validate
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


def build_capture(path: Path, blade: str, face: str, seq: int, meta: dict, sha: str, cap_id: str,
                  prefix: str, deriv) -> dict:
    base = f"{prefix}captures/{cap_id}/"
    gsd = compute_gsd(meta, deriv.width_px)
    lrf = num(meta.get("LRFTargetDistance"))
    lat, lon = num(meta.get("GPSLatitude")), num(meta.get("GPSLongitude"))
    if lat == 0 and lon == 0:  # sin fijación GPS
        lat = lon = None
    return {
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
        "gsd": ({"mm_px": gsd.mm_px, "source": gsd.source, "confidence": gsd.confidence} if gsd else None),
        "blade": {"position": blade, "face": face},
    }


def resolve_inspection(sb, args, index) -> str:
    if args.inspection:
        return args.inspection.lower()
    if index["inspections"].get(args.asset):
        return index["inspections"][args.asset]
    rows = (sb.table("inspections").select("id").eq("project_id", args.project).eq("asset_id", args.asset)
            .eq("status", "pending").order("created_at").limit(1).execute().data)
    insp = rows[0]["id"] if rows else str(uuid.uuid4())
    index["inspections"][args.asset] = insp
    return insp


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
    session = sb.auth.sign_in_with_password({"email": args.email, "password": password}).session
    token = session.access_token  # nunca se imprime

    proj = sb.table("projects").select("organization_id").eq("id", args.project).limit(1).execute().data
    if not proj:
        print("Proyecto no visible para este usuario.", file=sys.stderr)
        return 1
    org = proj[0]["organization_id"]

    index = load_index(args.folder)
    insp_id = resolve_inspection(sb, args, index)
    prefix = object_prefix(org, args.project, insp_id)
    captures: list[dict] = []
    seq_by_group: dict[tuple, int] = {}
    kw = dict(supabase_url=url, access_token=token, publishable_key=key)

    files = dedupe_by_sha(files)
    try:
      with tempfile.TemporaryDirectory() as tmp:
        for path, blade, face, sha in files:
            cap_id = index["captures"].setdefault(sha, str(uuid.uuid4()))
            meta = read_exif(path, exiftool)
            deriv = make_derivatives(path, Path(tmp) / cap_id)
            seq = seq_by_group.get((blade, face), 0)
            seq_by_group[(blade, face)] = seq + 1
            cap = build_capture(path, blade, face, seq, meta, sha, cap_id, prefix, deriv)
            tus_upload(path, cap["paths"]["original"], "image/jpeg", **kw)
            tus_upload(deriv.preview, cap["paths"]["preview"], "image/webp", **kw)
            tus_upload(deriv.thumb, cap["paths"]["thumb"], "image/webp", **kw)
            captures.append(cap)
            save_index(args.folder, index)
            gsd = cap["gsd"]["mm_px"] if cap["gsd"] else None
            print(f"  subida {path.name} ({blade}/{face}) gsd_mm_px={gsd and round(gsd, 4)}")

    finally:
        save_index(args.folder, index)
    inspection = {"id": insp_id, "asset_id": args.asset, "kind": "wind_blade"}
    manifest = build_manifest(args.project, inspection, captures)
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
    return 0
