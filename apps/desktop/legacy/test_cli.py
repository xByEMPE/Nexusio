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


def test_choose_inspection_order():
    from ingest_demo.cli import choose_inspection
    new = lambda: "nuevo"
    assert choose_inspection("ABC", "idx", True, "pend", new) == ("abc", False)
    assert choose_inspection(None, "idx", True, "pend", new) == ("idx", False)
    assert choose_inspection(None, "idx", False, "pend", new) == ("pend", False)
    assert choose_inspection(None, None, False, "pend", new) == ("pend", False)
    # Sin inspección existente: se crea; reutiliza el id del índice si lo había
    assert choose_inspection(None, "idx", False, None, new) == ("idx", True)
    assert choose_inspection(None, None, False, None, new) == ("nuevo", True)


class _Sess:
    def __init__(self, token, expires_at, refresh="r"):
        self.access_token, self.expires_at, self.refresh_token = token, expires_at, refresh


class _Auth:
    def __init__(self, session):
        self.session, self.refreshed = session, 0

    def get_session(self):
        return self.session

    def refresh_session(self, refresh_token):
        self.refreshed += 1
        self.session = _Sess("nuevo", 10_000)
        return type("R", (), {"session": self.session})()


def test_fresh_token_refreshes_near_expiry():
    from ingest_demo.cli import fresh_token
    auth = _Auth(_Sess("viejo", 1000 + 299))
    assert fresh_token(auth, now=lambda: 1000) == "nuevo" and auth.refreshed == 1
    auth = _Auth(_Sess("vigente", 1000 + 301))
    assert fresh_token(auth, now=lambda: 1000) == "vigente" and auth.refreshed == 0


class _Q:
    def __init__(self, log, data):
        self.log, self.data = log, data

    def __getattr__(self, name):
        return lambda *a, **k: self

    def insert(self, row):
        self.log.append(row)
        return self

    def execute(self):
        return type("R", (), {"data": self.data})()


class _SB:
    def __init__(self):
        self.inserted = []

    def table(self, name):
        assert name == "inspections"
        return _Q(self.inserted, [])


def test_resolve_inspection_creates_row_when_missing(tmp_path):
    from argparse import Namespace
    from ingest_demo.cli import load_index, resolve_inspection
    sb, index = _SB(), {"inspections": {}, "captures": {}}
    args = Namespace(inspection=None, project="p", asset="a")
    insp = resolve_inspection(sb, args, index, tmp_path)
    assert sb.inserted == [{"id": insp, "project_id": "p", "asset_id": "a", "kind": "wind_blade", "status": "captured"}]
    assert load_index(tmp_path)["inspections"]["a"] == insp


def test_id_photo_capture_has_no_blade_block():
    d = Derivatives(Path("p"), Path("t"), 100, 100)
    cap = build_capture(Path("id.jpg"), None, None, 0, {"LRFStatus": "Normal"}, "a" * 64, "id", "pre/", d)
    assert "blade" not in cap and cap["spectrum"] == "rgb"
    cap = build_capture(Path("a.jpg"), "A", "LE", 0, {}, "b" * 64, "id2", "pre/", d)
    assert cap["blade"] == {"position": "A", "face": "LE"}
