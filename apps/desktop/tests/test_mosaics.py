from pathlib import Path

from nexus_desktop.domain import mosaics


def test_build_mosaic_shape():
    s = mosaics.StripFile(Path("x.jpeg"), "B", "SS")
    m = mosaics.build_mosaic(s, "id1", "o/p/i/", 7000, 900)
    assert m == {"id": "id1", "kind": "blade_strip", "spectrum": "rgb", "blade": "B", "face": "SS",
                 "format": "image", "path": "o/p/i/mosaics/id1/strip.webp", "width_px": 7000, "height_px": 900}


# --- revisión final: límite de Pillow solo relajado para las tiras -----------------------------

import pytest  # noqa: E402
from PIL import Image  # noqa: E402

PIL_DEFAULT = int(1024 * 1024 * 1024 // 4 // 3)  # Image.MAX_IMAGE_PIXELS de Pillow


def test_importing_the_app_keeps_pillow_bomb_protection():
    import nexus_desktop.nexus.uploader  # noqa: F401
    import nexus_desktop.ui.screens.results  # noqa: F401

    assert Image.MAX_IMAGE_PIXELS == PIL_DEFAULT


def test_make_strip_raises_limit_only_inside(tmp_path, monkeypatch):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)  # 2x = 2000 px: una 100x100 es "bomba"
    src = tmp_path / "25_A_LeadingEdge.jpg"
    Image.new("RGB", (100, 100), (1, 2, 3)).save(src, "JPEG")
    assert mosaics.make_strip(src, tmp_path / "strip.webp") == (100, 100)
    assert Image.MAX_IMAGE_PIXELS == 1000  # restaurado
    with pytest.raises(Image.DecompressionBombError):  # fuera de las tiras sigue la protección
        Image.open(src)


def test_large_images_restores_after_error_and_nested(monkeypatch):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1234)
    with pytest.raises(RuntimeError):
        with mosaics.large_images():
            with mosaics.large_images():
                assert Image.MAX_IMAGE_PIXELS is None
            assert Image.MAX_IMAGE_PIXELS is None  # el de fuera sigue activo
            raise RuntimeError("x")
    assert Image.MAX_IMAGE_PIXELS == 1234
