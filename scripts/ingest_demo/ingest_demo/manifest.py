"""Construcción y validación del manifiesto v1."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator

from . import __version__

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "src" / "contracts" / "ingest-manifest.v1.schema.json"


def object_prefix(org_id: str, project_id: str, inspection_id: str) -> str:
    return f"{org_id}/{project_id}/{inspection_id}/".lower()


def build_manifest(project_id: str, inspection: dict, captures: list[dict], findings: list[dict] | None = None) -> dict:
    return {
        "manifest_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "app": {"name": "nexus-ingest-demo", "version": __version__},
        "project_id": project_id,
        "inspection": inspection,
        "captures": captures,
        "findings": list(findings or []),
    }


def validate(m: dict) -> None:
    """Lanza jsonschema.ValidationError si no cumple el esquema."""
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator(schema).validate(m)
