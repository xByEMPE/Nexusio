import pytest
from jsonschema import ValidationError

from ingest_demo.manifest import build_manifest, object_prefix, validate

ORG = "11111111-1111-4111-8111-111111111111"
PROJECT = "22222222-2222-4222-8222-222222222222"
INSPECTION = {"id": "33333333-3333-4333-8333-333333333333",
              "asset_id": "44444444-4444-4444-8444-444444444444", "kind": "wind_blade"}
CAPTURE_ID = "55555555-5555-4555-8555-555555555555"


def _capture():
    base = f"{object_prefix(ORG, PROJECT, INSPECTION['id'])}captures/{CAPTURE_ID}/"
    return {
        "id": CAPTURE_ID, "sha256": "a" * 64, "spectrum": "rgb", "file_name": "x.JPG",
        "paths": {"original": base + "original.jpg", "preview": base + "preview.webp", "thumb": base + "thumb.webp"},
        "width_px": 5280, "height_px": 3956,
    }


def test_manifest_validates_and_paths_are_prefixed():
    m = build_manifest(PROJECT, INSPECTION, [_capture()])
    validate(m)
    assert m["captures"][0]["paths"]["original"].startswith(f"{ORG}/{PROJECT}/{INSPECTION['id']}/captures/")


def test_object_prefix_is_lowercase_with_trailing_slash():
    assert object_prefix(ORG.upper(), PROJECT, INSPECTION["id"]) == f"{ORG}/{PROJECT}/{INSPECTION['id']}/"


def test_validate_rejects_bad_manifest():
    m = build_manifest(PROJECT, INSPECTION, [_capture()])
    m["captures"][0]["sha256"] = "xyz"
    with pytest.raises(ValidationError):
        validate(m)


def test_validate_rejects_empty_manifest():
    with pytest.raises(ValidationError):
        validate(build_manifest(PROJECT, INSPECTION, []))
