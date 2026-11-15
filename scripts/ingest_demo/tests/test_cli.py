from pathlib import Path

from ingest_demo.cli import build_capture, dedupe_by_sha, exif_datetime, resolve_exiftool
from ingest_demo.media import Derivatives


def test_dedupe_keeps_first_and_reports_rest(capsys):
    items = [(Path("a.jpg"), "A", "LE"), (Path("b.jpg"), "A", "LE"), (Path("c.jpg"), "A", "TE")]
    shas = {"a.jpg": "x", "b.jpg": "x", "c.jpg": "y"}
    out = dedupe_by_sha(items, sha_of=lambda p: shas[p.name])
    assert [o[0].name for o in out] == ["a.jpg", "c.jpg"]
    assert "b.jpg" in capsys.readouterr().out


def test_zero_gps_becomes_null():
    d = Derivatives(Path("p"), Path("t"), 100, 100)
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {"GPSLatitude": 0, "GPSLongitude": 0}, "a" * 64, "id", "pre/", d)
    assert cap["gps"]["lat"] is None and cap["gps"]["lon"] is None


def test_exif_datetime_prefers_utc_at_exposure():
    meta = {"UTCAtExposure": "2026:01:09 15:33:17.881310", "DateTimeOriginal": "2026:01:09 09:32:08"}
    assert exif_datetime(meta).startswith("2026-01-09T15:33:17")
    assert exif_datetime({"DateTimeOriginal": "2026:01:09 09:32:08"}).startswith("2026-01-09T09:32:08")


def test_resolve_exiftool_order(monkeypatch):
    monkeypatch.setenv("NEXUS_EXIFTOOL", "/env/exiftool")
    assert resolve_exiftool(Path("/arg/exiftool")) == Path("/arg/exiftool")
    assert resolve_exiftool(None) == Path("/env/exiftool")
