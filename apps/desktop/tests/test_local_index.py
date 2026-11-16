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


def test_second_corruption_does_not_clobber_first_bak(tmp_path):
    (tmp_path / INDEX_NAME).write_text("uno", encoding="utf-8")
    LocalIndex(tmp_path)
    (tmp_path / INDEX_NAME).write_text("dos", encoding="utf-8")
    LocalIndex(tmp_path)
    assert (tmp_path / (INDEX_NAME + ".bak")).read_text(encoding="utf-8") == "uno"
    assert (tmp_path / (INDEX_NAME + ".bak.1")).read_text(encoding="utf-8") == "dos"


def test_json_list_is_backed_up_and_empty(tmp_path):
    (tmp_path / INDEX_NAME).write_text("[1, 2]", encoding="utf-8")
    idx = LocalIndex(tmp_path)
    assert (tmp_path / (INDEX_NAME + ".bak")).exists()
    assert idx.inspection_id("A") is None
    assert idx.load_warning


def test_wrong_typed_uploaded_is_corrupt(tmp_path):
    (tmp_path / INDEX_NAME).write_text(json.dumps({"uploaded": "abc"}), encoding="utf-8")
    idx = LocalIndex(tmp_path)
    assert (tmp_path / (INDEX_NAME + ".bak")).exists()
    assert not idx.is_uploaded("a")
    assert idx.load_warning


def test_wrong_typed_mapping_is_corrupt(tmp_path):
    (tmp_path / INDEX_NAME).write_text(json.dumps({"captures": {"a": 1}}), encoding="utf-8")
    LocalIndex(tmp_path)
    assert (tmp_path / (INDEX_NAME + ".bak")).exists()


def test_folder_with_accents_and_spaces(tmp_path):
    folder = tmp_path / "Año 2026" / "WTG 25"
    folder.mkdir(parents=True)
    idx = LocalIndex(folder)
    cid = idx.capture_id("s")
    idx.save()
    assert LocalIndex(folder).capture_id("s") == cid
    assert LocalIndex(folder).load_warning is None


def test_oserror_on_rename_leaves_usable_empty_index(tmp_path, monkeypatch):
    (tmp_path / INDEX_NAME).write_text("{roto", encoding="utf-8")

    def boom(*a, **k):
        raise PermissionError("denegado")

    monkeypatch.setattr("nexus_desktop.storage.local_index.os.replace", boom)
    idx = LocalIndex(tmp_path)
    assert idx.load_warning
    assert idx.inspection_id("A") is None
    assert idx.capture_id("x")
