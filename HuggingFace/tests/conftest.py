import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "src" / "contracts" / "ingest-manifest.v1.schema.json"


@pytest.fixture(scope="session")
def schema_validator():
    """Validador del esquema JSON real del contrato (el mismo que usa la app de PC)."""
    jsonschema = pytest.importorskip("jsonschema")
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(schema)
    return jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())


@pytest.fixture
def capture():
    """Fila de ai_pending_captures."""
    return {
        "capture_id": "2d3e4f5a-6b7c-4d8e-9fa0-b1c2d3e4f5a6",
        "project_id": "6f1d2c3b-4a5e-4f60-8a71-9b8c7d6e5f40",
        "inspection_id": "0b6c1f2e-3d4a-4b5c-9d6e-7f8091a2b3c4",
        "asset_id": "1c2d3e4f-5a6b-4c7d-8e9f-a0b1c2d3e4f5",
        "inspection_kind": "wind_blade",
        "original_path": "org/project/insp/captures/c/original.jpg",
        "file_name": "DJI_0001.JPG",
        "width_px": 5280,
        "height_px": 3956,
        "gsd_mm_px": 0.75,
        "radius_center_m": 30.0,
        "blade": "A",
        "face": "LE",
        "attempts": 0,
    }
