import json
from pathlib import Path

from ingest_demo import vnd_manifest
from ingest_demo.vnd_manifest import VndPhoto


def write(folder: Path, blade: str, length: float, images: list[dict]) -> None:
    (folder / f"manifest_{blade}.json").write_text(
        json.dumps({"bladeInfo": {"length": length}, "images": images}), encoding="utf-8")


def img(name, radius, gsd, direction):
    return {"id": name, "metadata": {"sequence_direction": direction},
            "computed": {"radius": radius, "gsd": gsd}}


def test_load_reads_radius_gsd_and_direction(tmp_path):
    write(tmp_path, "A", 37000.0, [img("a.JPG", 1270.09, 0.8383, "TipToRoot"), img("b.JPG", 0.0, None, "RootToTip")])
    got = vnd_manifest.load(tmp_path)
    assert got["a.JPG"] == VndPhoto(1.27009, 0.8383, "tip_to_root")
    assert got["b.JPG"] == VndPhoto(0.0, None, "root_to_tip")


def test_load_ignores_missing_manifests_and_unknown_direction(tmp_path):
    write(tmp_path, "B", 37000.0, [img("c.JPG", None, None, "Raro")])
    got = vnd_manifest.load(tmp_path)
    assert got == {"c.JPG": VndPhoto(None, None, None)}
    assert vnd_manifest.load(tmp_path / "nada") == {}


def test_blade_length_m_first_and_warning(tmp_path, capsys):
    write(tmp_path, "A", 37000.0, [])
    write(tmp_path, "B", 38000.0, [])
    assert vnd_manifest.blade_length_m(tmp_path) == 37.0
    assert "difieren" in capsys.readouterr().out
    assert vnd_manifest.blade_length_m(tmp_path / "nada") is None
