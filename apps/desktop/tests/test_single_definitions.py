"""Una sola definición para las reglas compartidas (si se duplican, divergen en silencio) y sin
código muerto en producción."""
from __future__ import annotations

from pathlib import Path

import pytest

from nexus_desktop.domain import files, marking, mosaics, position, reconstruction, wtg_folder
from nexus_desktop.nexus import builder
from nexus_desktop.ui.screens import upload

PKG = Path(__file__).resolve().parents[1] / "nexus_desktop"


def test_root_to_tip_faces_is_shared_by_marking_and_stitching():
    assert reconstruction.ROOT_TO_TIP_FACES is marking.ROOT_TO_TIP_FACES


def test_directions_is_shared_by_manifest_and_upload_screen():
    assert upload.DIRECTIONS is builder.DIRECTIONS


@pytest.mark.parametrize("name,defined_in", [
    ("ROOT_TO_TIP_FACES =", "domain/marking.py"),
    ("DIRECTIONS =", "nexus/builder.py"),
])
def test_constant_defined_once(name, defined_in):
    where = [p.relative_to(PKG).as_posix() for p in PKG.rglob("*.py") if name in p.read_text(encoding="utf-8")]
    assert where == [defined_in]


def test_list_jpegs_sorted_case_insensitive_without_hidden(tmp_path):
    for n in ("b.JPG", "a.jpeg", "c.png", ".oculta.jpg", "._a.jpg", "z.Jpg"):
        (tmp_path / n).write_bytes(b"x")
    (tmp_path / "carpeta.jpg").mkdir()
    assert [p.name for p in files.list_jpegs(tmp_path)] == ["a.jpeg", "b.JPG", "z.Jpg"]


def test_folder_scan_and_id_photo_use_the_same_jpeg_filter():
    assert wtg_folder.list_jpegs is files.list_jpegs and position.list_jpegs is files.list_jpegs


def test_dead_code_removed():
    assert not hasattr(mosaics, "scan")
    assert not hasattr(marking.MarkingState, "to_dict") and not hasattr(marking.MarkingState, "from_dict")
