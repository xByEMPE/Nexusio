"""Lista local de subidas sin terminar (config.data_dir()/pending.json)."""
from __future__ import annotations

import json

from nexus_desktop.storage import pending


def test_round_trip_with_accented_folder(tmp_path):
    base = tmp_path / "datos"
    folder = tmp_path / "Inspección Ñandú" / "WTG 25"
    pending.save_status(folder, "Parque Norte", "WTG-01", "in_progress", base_dir=base)
    items = pending.load(base_dir=base)
    assert len(items) == 1
    item = items[0]
    assert item.folder == str(folder)
    assert (item.project, item.asset, item.status) == ("Parque Norte", "WTG-01", "in_progress")
    assert item.updated_at
    raw = (base / pending.FILE_NAME).read_text(encoding="utf-8")
    assert "Ñandú" in raw  # UTF-8 legible, sin escapes
    assert set(json.loads(raw)[0]) == {"folder", "project", "asset", "status", "updated_at"}


def test_same_folder_updates_entry_and_remove(tmp_path):
    folder = tmp_path / "WTG 25"
    other = tmp_path / "WTG 26"
    pending.save_status(folder, "P", "A1", "in_progress", base_dir=tmp_path)
    pending.save_status(other, "P", "A2", "cancelled", base_dir=tmp_path)
    pending.save_status(folder, "P", "A1", "errors", base_dir=tmp_path)
    items = pending.load(base_dir=tmp_path)
    assert [(i.asset, i.status) for i in items] == [("A1", "errors"), ("A2", "cancelled")]
    pending.remove(folder, base_dir=tmp_path)
    assert [i.asset for i in pending.load(base_dir=tmp_path)] == ["A2"]
    pending.remove(tmp_path / "no-existe", base_dir=tmp_path)  # quitar algo ausente no falla
    assert len(pending.load(base_dir=tmp_path)) == 1


def test_missing_or_damaged_file_reads_as_empty(tmp_path):
    assert pending.load(base_dir=tmp_path) == []
    (tmp_path / pending.FILE_NAME).write_text("{no es json", encoding="utf-8")
    assert pending.load(base_dir=tmp_path) == []
    (tmp_path / pending.FILE_NAME).write_text(json.dumps([{"folder": 3}, "x", {"folder": "C:/a"}]),
                                              encoding="utf-8")
    items = pending.load(base_dir=tmp_path)
    assert [i.folder for i in items] == ["C:/a"]  # las entradas inválidas se ignoran
    pending.save_status(tmp_path / "b", "P", "A", "errors", base_dir=tmp_path)  # y se puede reescribir
    assert len(pending.load(base_dir=tmp_path)) == 2


def test_default_location_is_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    pending.save_status(tmp_path / "WTG", "P", "A", "interrupted")
    assert (tmp_path / "NEXUS" / pending.FILE_NAME).is_file()
    assert pending.status_text("interrupted") == "Subida interrumpida"
    assert pending.status_text("raro") == "Subida sin terminar"


def test_blocked_status_text():
    assert pending.status_text("blocked") == "Bloqueada: la inspección se está eliminando en NEXUS"
