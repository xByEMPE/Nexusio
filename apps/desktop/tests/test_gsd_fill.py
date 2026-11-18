"""Relleno del GSD de las fotos sin láser (domain/gsd_fill): reglas (i)-(v) de la investigación."""
import os
import statistics
from pathlib import Path

import pytest

from nexus_desktop.domain.gsd import GsdResult
from nexus_desktop.domain.gsd_fill import (MAX_NEIGHBOR_PHOTOS, GsdSample, PhotoGsd, fill_missing_gsd)

SOURCE = "mosaic_calibration"


def lrf(mm):
    return GsdResult(mm, "lrf", "high")


def face(values, alts=None, step=3.0):
    """Muestras de una cara: `values` con None donde falta el láser; altitud de 10 m + step·i."""
    return [GsdSample(lrf(v) if v is not None else None,
                      (10.0 + step * i) if alts is None else alts[i]) for i, v in enumerate(values)]


def mm(results):
    return [r.mm_px for r in results]


def test_measured_values_are_never_overwritten():
    samples = face([1.0, None, 2.0, 1.5, None])
    out = fill_missing_gsd(samples, 1.7)
    for sample, result in zip(samples, out):
        if sample.gsd is not None:
            assert result == PhotoGsd(sample.gsd.mm_px, sample.gsd.source, sample.gsd.confidence, False)


def test_interior_single_gap_is_interpolated_by_altitude():
    # altitudes 10, 13, 22 (la foto de en medio está más cerca de la primera)
    out = fill_missing_gsd(face([1.0, None, 2.0], alts=[10.0, 13.0, 22.0]), None)
    assert out[1].mm_px == pytest.approx(1.0 + (13 - 10) / (22 - 10) * 1.0)
    assert out[1] == PhotoGsd(out[1].mm_px, SOURCE, "low", True)


@pytest.mark.parametrize("gap", [3, 5])
def test_interior_run_is_between_neighbours_and_monotone(gap):
    out = fill_missing_gsd(face([1.0] + [None] * gap + [2.0]), 9.9)
    filled = mm(out)[1:-1]
    assert all(1.0 < v < 2.0 for v in filled)
    assert filled == sorted(filled)
    assert all(r.estimated and r.source == SOURCE and r.confidence == "low" for r in out[1:-1])
    assert filled[0] == pytest.approx(1.0 + 1 / (gap + 1))  # la tira no interviene en el interior


def test_interior_monotone_decreasing_with_altitude():
    out = fill_missing_gsd(face([3.0, None, None, 1.0]), None)
    assert 3.0 > out[1].mm_px > out[2].mm_px > 1.0


def test_extreme_averages_nearest_neighbour_and_strip():
    out = fill_missing_gsd(face([None, None, 2.0, 2.2]), 1.0)
    assert mm(out)[:2] == [pytest.approx(1.5), pytest.approx(1.5)]  # (2.0 + 1.0) / 2
    out = fill_missing_gsd(face([2.0, 2.2, None, None]), 3.0)
    assert mm(out)[2:] == [pytest.approx(2.6), pytest.approx(2.6)]  # (2.2 + 3.0) / 2
    assert all(r.estimated and r.confidence == "low" and r.source == SOURCE for r in out[2:])


def test_extreme_without_strip_uses_nearest_neighbour_only():
    out = fill_missing_gsd(face([None, 2.0, 2.2]), None)
    assert out[0].mm_px == pytest.approx(2.0) and out[0].estimated


def test_face_without_any_gsd_uses_strip_only_or_stays_null():
    out = fill_missing_gsd(face([None, None]), 1.4)
    assert mm(out) == [pytest.approx(1.4)] * 2 and all(r.estimated for r in out)
    out = fill_missing_gsd(face([None, None]), None)
    assert out == [PhotoGsd(None, None, None, False)] * 2


def test_far_neighbours_are_not_used():
    n = MAX_NEIGHBOR_PHOTOS + 3
    out = fill_missing_gsd(face([1.0] + [None] * n), None)
    assert out[1].mm_px == pytest.approx(1.0)                      # vecina cercana
    assert out[-1].mm_px is None and not out[-1].estimated         # demasiado lejos, sin tira
    out = fill_missing_gsd(face([1.0] + [None] * n), 2.0)
    assert out[-1].mm_px == pytest.approx(2.0)                     # solo la tira


def test_far_altitude_neighbour_is_not_used():
    out = fill_missing_gsd(face([1.0, None], alts=[10.0, 100.0]), None)
    assert out[1].mm_px is None


def test_outlier_anchor_is_kept_but_not_used():
    samples = face([1.0, 1.1, 50.0, None, 1.2, 1.3])
    out = fill_missing_gsd(samples, None)
    assert out[2] == PhotoGsd(50.0, "lrf", "high", False)           # no se corrige
    assert 1.1 < out[3].mm_px < 1.2                                 # ni se usa de ancla: entre 1,1 y 1,2


def test_final_value_outside_valid_range_stays_null():
    out = fill_missing_gsd(face([None, 0.001, 0.002]), None)  # medidas válidas por sí solas
    assert out[0].mm_px is None
    out = fill_missing_gsd(face([None]), 500.0)
    assert out[0] == PhotoGsd(None, None, None, False)


def test_equal_unordered_or_missing_altitudes_fall_back_to_index():
    equal = fill_missing_gsd(face([1.0, None, None, 2.0], alts=[10.0] * 4), None)
    assert mm(equal)[1:3] == [pytest.approx(1 + 1 / 3), pytest.approx(1 + 2 / 3)]
    unordered = fill_missing_gsd(face([1.0, None, 2.0], alts=[10.0, 30.0, 12.0]), None)
    assert unordered[1].mm_px == pytest.approx(1.5)
    missing = fill_missing_gsd(face([1.0, None, 2.0], alts=[10.0, None, 12.0]), None)
    assert missing[1].mm_px == pytest.approx(1.5)


def test_empty_input():
    assert fill_missing_gsd([], 1.0) == []


def test_invalid_strip_value_is_ignored():
    for bad in (0.0, -1.0, float("nan"), None):
        out = fill_missing_gsd(face([None, 2.0]), bad)
        assert out[0].mm_px == pytest.approx(2.0)


# --- Datos reales (lenta) -----------------------------------------------------------------

SAMPLE_WTG = Path(os.environ.get("NEXUS_SAMPLE_WTG", r"C:\Users\airsc\Documents\NEXUS\WTG 25"))


@pytest.mark.slow
@pytest.mark.skipif(not SAMPLE_WTG.is_dir(), reason="sin carpeta de ejemplo (NEXUS_SAMPLE_WTG)")
def test_wtg25_real_exif_fill_matches_the_investigation(capsys):
    from nexus_desktop import config
    from nexus_desktop.domain.exif import num, read_exif_batch
    from nexus_desktop.domain.gsd import compute_gsd
    from nexus_desktop.domain.reconstruction import _altitude
    from nexus_desktop.domain.wtg_folder import scan_wtg

    exiftool = config.resolve_exiftool()
    if exiftool is None:
        pytest.skip("sin exiftool (NEXUS_EXIFTOOL o PATH)")
    wtg = scan_wtg(SAMPLE_WTG)
    faces = []  # (nombre, muestras) por sección
    for blade, by_face in wtg.blades.items():
        for face, paths in by_face.items():
            exif = read_exif_batch(list(paths), exiftool)
            samples = []
            for path in paths:
                meta = exif.get(path) or {}
                width = num(meta.get("ImageWidth")) or num(meta.get("ExifImageWidth")) or 0
                samples.append(GsdSample(compute_gsd(meta, int(width)) if meta else None, _altitude(meta)))
            faces.append((f"{blade}/{face}", samples))
    total = sum(len(s) for _n, s in faces)
    measured = sum(1 for _n, s in faces for x in s if x.gsd is not None)

    # (a) lo medido por láser no cambia; (b) lo rellenado es razonable y monótono con la altitud
    filled_total = interior_total = 0
    for name, samples in faces:
        out = fill_missing_gsd(samples, None)
        anchors = [i for i, x in enumerate(samples) if x.gsd is not None]
        for x, r in zip(samples, out):
            if x.gsd is not None:
                assert r == PhotoGsd(x.gsd.mm_px, x.gsd.source, x.gsd.confidence, False), name
        for i, (x, r) in enumerate(zip(samples, out)):
            if x.gsd is None and r.estimated:
                filled_total += 1
                assert 0.3 <= r.mm_px <= 3.0, (name, i, r.mm_px)
                assert r.source == "mosaic_calibration" and r.confidence == "low"
        for p, n in zip(anchors, anchors[1:]):
            run = list(range(p + 1, n))
            ap, an = samples[p].altitude_m, samples[n].altitude_m
            vp, vn = samples[p].gsd.mm_px, samples[n].gsd.mm_px
            if not run or ap is None or an is None or ap == an or n - p > MAX_NEIGHBOR_PHOTOS:
                continue
            ordered = [i for i in run if samples[i].altitude_m is not None
                       and 0 <= (samples[i].altitude_m - ap) / (an - ap) <= 1]
            interior_total += len(ordered)
            for i in ordered:
                assert min(vp, vn) - 1e-9 <= out[i].mm_px <= max(vp, vn) + 1e-9, (name, i)
                for j in ordered:  # monótono con la altitud
                    d_alt = samples[i].altitude_m - samples[j].altitude_m
                    d_val = out[i].mm_px - out[j].mm_px
                    assert d_val * d_alt * (vn - vp) * (an - ap) >= -1e-9, (name, i, j)

    # (c) ocultar un GSD medido del interior, rellenarlo y compararlo con el real
    errors = []
    for name, samples in faces:
        anchors = [i for i, x in enumerate(samples) if x.gsd is not None]
        for i in anchors[1:-1]:
            hidden = list(samples)
            hidden[i] = GsdSample(None, samples[i].altitude_m)
            got = fill_missing_gsd(hidden, None)[i]
            assert got.estimated
            errors.append(abs(got.mm_px - samples[i].gsd.mm_px) / samples[i].gsd.mm_px)
    mean_err = statistics.mean(errors)
    with capsys.disabled():
        print(f"\nWTG real: {total} fotos, {measured} con láser, {total - measured} sin; "
              f"rellenadas sin tira: {filled_total} (interior {interior_total}); "
              f"ocultar 1 foto del interior: n={len(errors)} error medio {mean_err:.1%}, máx {max(errors):.1%}")
    assert errors and mean_err < 0.10
    if SAMPLE_WTG.name == "WTG 25":
        assert (total, measured) == (212, 161)
