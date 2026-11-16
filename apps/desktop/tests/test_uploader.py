import json
import shutil
import threading
from pathlib import Path

import pytest
from PIL import Image
from postgrest.exceptions import APIError

from nexus_desktop.domain.media import sha256_file
from nexus_desktop.domain.wtg_folder import scan_wtg
from nexus_desktop.nexus import uploader
from nexus_desktop.nexus.manifest import validate
from nexus_desktop.nexus.projects import Asset, Project
from nexus_desktop.nexus.session import SessionLost
from nexus_desktop.nexus.uploader import PhotoInfo, StripInput, UploadPlan, upload_inspection
from nexus_desktop.storage.local_index import INDEX_NAME, LocalIndex
from tests.conftest import FakeAppSession, FakeClient, FakeTus

ORG = "11111111-1111-4111-8111-111111111111"
PROJECT = "22222222-2222-4222-8222-222222222222"
INSP = "33333333-3333-4333-8333-333333333333"
ASSET = "44444444-4444-4444-8444-444444444444"
PHOTOS = {
    "Blade A/LE/a1.jpg": (255, 0, 0), "Blade A/LE/a2.jpg": (0, 255, 0), "Blade A/TE/a3.jpg": (0, 0, 255),
    "Blade B/LE/b1.jpg": (255, 255, 0), "WTG25_ID/id.jpg": (0, 255, 255),
}
N_OBJECTS = len(PHOTOS) * 3 + 1  # original, preview y miniatura por foto + una tira


@pytest.fixture(autouse=True)
def fake_exif(monkeypatch):
    def read(path, exiftool):
        if path.parent.name.endswith("_ID"):
            return {"GPSLatitude": 40.5, "GPSLongitude": -3.5}
        return {}

    monkeypatch.setattr(uploader, "read_exif", read)


def make_wtg(tmp_path, extra=None):
    root = tmp_path / "WTG 25"
    for rel, color in {**PHOTOS, **(extra or {})}.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(color, bytes):
            p.write_bytes(color)
        else:
            Image.new("RGB", (64, 48), color).save(p, "JPEG")
    return root


def make_strip(tmp_path, name="25_A_LeadingEdge.jpg", size=(20, 200)):
    p = tmp_path / "strips" / name
    p.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, (9, 9, 9)).save(p, "JPEG")
    return p


def make_plan(root, strips, photo_info=None):
    return UploadPlan(folder=scan_wtg(root), project=Project(PROJECT, "Parque", ORG),
                      asset=Asset(ASSET, "WTG 25", "captured"), blade_length_m=60.0, strips=strips,
                      photo_info=photo_info or {})


class FakeIngest:
    """public.ingest_manifest en miniatura: exige los objetos en Storage y cuenta altas/cambios por id."""

    def __init__(self, tus):
        self.tus, self.ids, self.manifests = tus, set(), []

    def __call__(self, name, params):
        assert name == "ingest_manifest"
        m = params["p_manifest"]
        validate(m)
        self.manifests.append(m)
        errors = [{"path": f"/captures/{i}/paths/{k}", "code": "missing_object"}
                  for i, c in enumerate(m["captures"]) for k, p in c["paths"].items() if p not in self.tus.objects]
        errors += [{"path": f"/mosaics/{i}/path", "code": "missing_object"}
                   for i, x in enumerate(m["mosaics"]) if x["path"] not in self.tus.objects]
        if errors:
            raise APIError({"code": "22023", "message": "manifest_invalid", "details": json.dumps(errors)})
        out = {"inserted": {}, "updated": {}, "skipped": {"findings": []}}
        for kind in ("captures", "mosaics"):
            new = [x["id"] for x in m[kind] if x["id"] not in self.ids]
            out["inserted"][kind] = len(new)
            out["updated"][kind] = len(m[kind]) - len(new)
            self.ids.update(new)
        return out


def setup(tmp_path, extra=None, strips=None, photo_info=None):
    root = make_wtg(tmp_path, extra)
    if strips is None:
        strips = [StripInput("A", "LE", make_strip(tmp_path), None)]
    client = FakeClient({"inspections": [{"id": INSP, "project_id": PROJECT, "asset_id": ASSET,
                                          "kind": "wind_blade", "status": "captured"}]})
    tus = FakeTus()
    client.rpc_handler = FakeIngest(tus)
    return root, make_plan(root, strips, photo_info), client, tus


def run(plan, client, tus, *, session=None, cancel=None, msgs=None, index=None):
    msgs = [] if msgs is None else msgs
    return upload_inspection(plan, session or FakeAppSession(client), index or LocalIndex(plan.folder.path),
                             Path("exiftool"), lambda m, f: msgs.append((m, f)), cancel or threading.Event(),
                             tus=tus, supabase_url="http://127.0.0.1:54321", publishable_key="pk")


def manifests(client):
    return [params["p_manifest"] for _, params in client.rpc_calls]


def test_uploads_each_object_once_and_calls_ingest_per_blade(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    a1 = root / "Blade A/LE/a1.jpg"
    plan.photo_info = {a1: PhotoInfo(5.0, "root_to_tip")}
    msgs = []
    report = run(plan, client, tus, msgs=msgs)

    objects = [c["object"] for c in tus.calls]
    assert len(objects) == N_OBJECTS and len(set(objects)) == N_OBJECTS
    prefix = f"{ORG}/{PROJECT}/{INSP}/"
    assert all(o.startswith(prefix) for o in objects)
    assert {c["type"] for c in tus.calls if c["object"].endswith(".jpg")} == {"image/jpeg"}
    assert {c["type"] for c in tus.calls if c["object"].endswith(".webp")} == {"image/webp"}

    ma, mb = manifests(client)
    assert {c["blade"]["position"] for c in ma["captures"] if "blade" in c} == {"A"}
    id_caps = [c for c in ma["captures"] if "blade" not in c]
    assert len(id_caps) == 1 and ma["inspection"]["id_capture_id"] == id_caps[0]["id"]
    assert len(ma["captures"]) == 4 and [x["blade"] for x in ma["mosaics"]] == ["A"]
    assert "calibration" not in ma["mosaics"][0]
    assert [c["blade"]["position"] for c in mb["captures"]] == ["B"] and mb["mosaics"] == []
    assert "id_capture_id" not in mb["inspection"]
    assert ma["inspection"]["blade_length_m"] == 60.0 and ma["inspection"]["id"] == INSP
    by_name = {c["file_name"]: c for c in ma["captures"]}
    assert by_name["a1.jpg"]["blade"] == {"position": "A", "face": "LE", "radius_center_m": 5.0,
                                          "sequence_direction": "root_to_tip"}
    assert [by_name["a1.jpg"]["sequence_index"], by_name["a2.jpg"]["sequence_index"]] == [0, 1]
    assert (by_name["a1.jpg"]["width_px"], by_name["a1.jpg"]["height_px"]) == (64, 48)

    assert report.inserted == {"captures": 5, "mosaics": 1}
    assert report.updated == {"captures": 0, "mosaics": 0}
    assert report.skipped == {"findings": []} and report.errors == [] and report.cancelled is False
    assert client.updated == [("inspections", {"asset_lat": 40.5, "asset_lon": -3.5,
                                               "asset_position_source": "gps"})]
    assert msgs[-1][1] == 1.0
    assert all(0.0 <= f <= 1.0 for _, f in msgs)
    assert [f for _, f in msgs] == sorted(f for _, f in msgs)


def test_second_run_uploads_nothing_and_reports_zero_inserted(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    run(plan, client, tus)
    first = len(tus.calls)

    report = run(plan, client, tus, index=LocalIndex(root))  # índice recargado del disco
    assert len(tus.calls) == first
    assert report.inserted == {"captures": 0, "mosaics": 0}
    assert report.updated == {"captures": 5, "mosaics": 1}
    m1, m2, m3, m4 = manifests(client)
    assert [c["id"] for c in m1["captures"]] == [c["id"] for c in m3["captures"]]
    assert m1["mosaics"][0]["id"] == m3["mosaics"][0]["id"]


def test_skips_corrupt_photo_and_continues(tmp_path):
    root, plan, client, tus = setup(tmp_path, extra={"Blade A/TE/bad.jpg": b"esto no es un jpeg"})
    msgs = []
    report = run(plan, client, tus, msgs=msgs)
    assert any("bad.jpg" in m for m, _ in msgs)
    assert len(tus.calls) == N_OBJECTS
    names = [c["file_name"] for m in manifests(client) for c in m["captures"]]
    assert "bad.jpg" not in names and len(names) == 5
    assert report.errors == [] and report.inserted["captures"] == 5


def test_cancel_stops_after_current_file(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    cancel = threading.Event()
    tus.hook = lambda t: cancel.set()  # se cancela durante la primera foto
    report = run(plan, client, tus, cancel=cancel)
    assert len(tus.calls) == 3  # la foto en curso termina (original, preview, miniatura)
    assert client.rpc_calls == [] and client.updated == []
    assert report.cancelled is True and report.inserted == {} and report.errors == []
    again = LocalIndex(root)
    assert all(again.is_uploaded(c["object"]) for c in tus.calls)


def test_cancel_before_start_uploads_nothing(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    cancel = threading.Event()
    cancel.set()
    report = run(plan, client, tus, cancel=cancel)
    assert tus.calls == [] and client.rpc_calls == [] and report.cancelled is True


def test_manifest_invalid_returns_path_and_code(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    ingest = client.rpc_handler

    def handler(name, params):
        if params["p_manifest"]["mosaics"]:  # la pala A
            raise APIError({"code": "22023", "message": "manifest_invalid", "details": json.dumps(
                [{"path": "/captures/0/paths/original", "code": "missing_object"},
                 {"path": "/inspection/id", "code": "inspection_locked"}])})
        return ingest(name, params)

    client.rpc_handler = handler
    msgs = []
    report = run(plan, client, tus, msgs=msgs)
    assert report.errors == [{"path": "/captures/0/paths/original", "code": "missing_object"},
                             {"path": "/inspection/id", "code": "inspection_locked"}]
    assert report.inserted == {"captures": 1, "mosaics": 0}  # la pala B sí entró
    assert any("A" in m and "rechaz" in m for m, _ in msgs)


@pytest.mark.parametrize("exc", [
    APIError({"code": "22023", "message": "manifest_invalid", "details": "no es json"}),
    APIError({"code": "22023", "message": "manifest_invalid", "details": json.dumps([{"path": 3}])}),
    APIError({"code": "42501", "message": "permission denied", "details": None}),
    RuntimeError("sin red"),
])
def test_unknown_ingest_error_becomes_unknown_code(tmp_path, exc):
    root, plan, client, tus = setup(tmp_path)

    def handler(name, params):
        raise exc

    client.rpc_handler = handler
    report = run(plan, client, tus)
    assert report.errors == [{"path": "", "code": "unknown"}] * 2


def test_manifest_invalid_details_already_parsed(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    err = [{"path": "/captures/1/sha256", "code": "duplicate_sha256"}]

    def handler(name, params):
        raise APIError({"code": "22023", "message": "manifest_invalid", "details": err})

    client.rpc_handler = handler
    assert run(plan, client, tus).errors == err * 2


def test_refreshes_token_before_each_upload(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    session = FakeAppSession(client)
    run(plan, client, tus, session=session)
    assert session.calls == len(tus.calls) == N_OBJECTS
    assert [c["token"] for c in tus.calls] == [f"tok{i}" for i in range(1, N_OBJECTS + 1)]


def test_session_lost_propagates_after_saving_index(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    with pytest.raises(SessionLost):
        run(plan, client, tus, session=FakeAppSession(client, lose_after=4))
    assert len(tus.calls) == 4 and client.rpc_calls == []
    again = LocalIndex(root)
    assert all(again.is_uploaded(c["object"]) for c in tus.calls)
    sha = sha256_file(Path(tus.calls[0]["path"]))
    assert again.capture_id(sha) in tus.calls[0]["object"]


def test_identical_sha_uploaded_once(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    (root / "Blade B/TE").mkdir(parents=True)
    shutil.copyfile(root / "Blade A/LE/a1.jpg", root / "Blade B/TE/dup.jpg")
    plan = make_plan(root, plan.strips)
    msgs = []
    report = run(plan, client, tus, msgs=msgs)
    assert len(tus.calls) == N_OBJECTS
    names = [c["file_name"] for m in manifests(client) for c in m["captures"]]
    assert "dup.jpg" not in names and report.inserted["captures"] == 5
    assert any("dup.jpg" in m and "idéntica" in m for m, _ in msgs)


def test_load_warning_is_reported_through_progress(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    (root / INDEX_NAME).write_text("{roto", encoding="utf-8")
    index = LocalIndex(root)
    msgs = []
    run(plan, client, tus, msgs=msgs, index=index)
    assert msgs[0][0] == index.load_warning


def test_strip_calibration_scaled_to_uploaded_size(tmp_path):
    strip = make_strip(tmp_path, size=(10, 12000))
    cal = {"tip_row_px": 600, "root_row_px": 11400, "blade_length_m": 60.0, "mm_per_px": 2.0, "root_at_top": False}
    root, plan, client, tus = setup(tmp_path, strips=[StripInput("A", "LE", strip, cal)])
    run(plan, client, tus)
    mos = manifests(client)[0]["mosaics"][0]
    assert mos["height_px"] == 8000
    assert mos["calibration"] == {"tip_row_px": 400, "root_row_px": 7600, "blade_length_m": 60.0,
                                  "mm_per_px": 3.0, "root_at_top": False}


def test_strip_of_blade_without_photos_is_not_uploaded(tmp_path):
    root, plan, client, tus = setup(tmp_path)
    plan.strips.append(StripInput("C", "LE", make_strip(tmp_path, "25_C_LeadingEdge.jpg"), None))
    msgs = []
    report = run(plan, client, tus, msgs=msgs)
    assert len(tus.calls) == N_OBJECTS and len(client.rpc_calls) == 2
    assert any("C" in m and "sin fotos" in m for m, _ in msgs)
    assert report.errors == []
