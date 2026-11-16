import json
import uuid

from nexus_desktop.storage.local_index import INDEX_NAME, LocalIndex


def test_capture_id_is_stable_across_reload(tmp_path):
    idx = LocalIndex(tmp_path)
    first = idx.capture_id("abc")
    assert str(uuid.UUID(first)) == first
    idx.save()
    assert LocalIndex(tmp_path).capture_id("abc") == first


def test_two_shas_get_different_ids(tmp_path):
    idx = LocalIndex(tmp_path)
    assert idx.capture_id("a") != idx.capture_id("b")
    assert idx.mosaic_id("m1.jpg") != idx.mosaic_id("m2.jpg")


def test_loads_legacy_ingest_demo_index(tmp_path):
    (tmp_path / INDEX_NAME).write_text(
        json.dumps({"inspections": {"A1": "i-1"}, "captures": {"sha": "c-1"}}),
        encoding="utf-8",
    )
    idx = LocalIndex(tmp_path)
    assert idx.inspection_id("A1") == "i-1"
    assert idx.capture_id("sha") == "c-1"
    assert idx.is_uploaded("x") is False
    assert idx.inspection_id("nope") is None
    idx.mosaic_id("m")  # sin "mosaics" en el archivo legado
    idx.save()
    assert "uploaded" in json.loads((tmp_path / INDEX_NAME).read_text(encoding="utf-8"))


def test_is_uploaded_survives_save_and_reload(tmp_path):
    idx = LocalIndex(tmp_path)
    idx.mark_uploaded("o/p.jpg")
    idx.mark_uploaded("o/p.jpg")
    idx.set_inspection("A1", "i-9")
    idx.save()
    again = LocalIndex(tmp_path)
    assert again.is_uploaded("o/p.jpg")
    assert not again.is_uploaded("o/q.jpg")
    assert again.inspection_id("A1") == "i-9"
    data = json.loads((tmp_path / INDEX_NAME).read_text(encoding="utf-8"))
    assert data["uploaded"] == ["o/p.jpg"]
    assert [p.name for p in tmp_path.iterdir()] == [INDEX_NAME]


def test_corrupt_file_is_renamed_and_new_index_started(tmp_path):
    (tmp_path / INDEX_NAME).write_text("{roto", encoding="utf-8")
    idx = LocalIndex(tmp_path)
    assert (tmp_path / (INDEX_NAME + ".bak")).read_text(encoding="utf-8") == "{roto"
    assert idx.inspection_id("A1") is None
    idx.save()
    assert json.loads((tmp_path / INDEX_NAME).read_text(encoding="utf-8"))["captures"] == {}
