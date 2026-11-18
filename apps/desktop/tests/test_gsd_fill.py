"""Relleno del GSD de las fotos sin láser (domain/gsd_fill): reglas (i)-(v) de la investigación."""
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
