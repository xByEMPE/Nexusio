import pytest

from nexus_detector.measurements import _js_round, finding_measurements, radius_at_row

BOX = [[0.41, 0.22], [0.47, 0.30]]


def test_medidas_de_la_caja_con_gsd():
    m = finding_measurements(BOX, 5280, 3956, 2.0, None)
    assert m["width_mm"] == pytest.approx(0.06 * 5280 * 2, abs=1e-6)
    assert m["length_mm"] == pytest.approx(0.08 * 3956 * 2, abs=1e-6)
    assert m["area_mm2"] == pytest.approx(m["width_mm"] * m["length_mm"], rel=1e-6)
    assert m["gsd_mm_px_used"] == 2.0
    assert m["radius_m"] is None  # sin radius_center_m no hay radio


@pytest.mark.parametrize("gsd", [None, 0, -1.0])
def test_sin_gsd_valido_no_hay_medidas(gsd):
    assert finding_measurements(BOX, 5280, 3956, gsd, 30.0) is None


def test_el_radio_sigue_a_measure_ts():
    # Misma fórmula que src/lib/blade/measure.ts con la punta arriba: r = rc - (yc - H/2)*g/1000, redondeado a cm
    H, g, rc = 3956, 0.75, 30.0
    m = finding_measurements(BOX, 5280, H, g, rc)
    yc = (0.22 * H + 0.30 * H) / 2
    esperado = round(rc - (yc - H / 2) * g / 1000, 2)
    assert m["radius_m"] == pytest.approx(esperado, abs=1e-9)
    # Fila por encima del centro de la foto (y < H/2) -> más cerca de la punta -> radio mayor que rc
    assert m["radius_m"] > rc


def test_radio_no_negativo():
    m = finding_measurements([[0, 0.99], [0.1, 1.0]], 1000, 1000, 1000.0, 0.1)
    assert m["radius_m"] == 0.0


def test_radius_at_row_punta_abajo_invierte_el_signo():
    arriba = radius_at_row(100, 30.0, 1.0, 1000, tip_at_top=True)
    abajo = radius_at_row(100, 30.0, 1.0, 1000, tip_at_top=False)
    assert arriba == pytest.approx(30.4)
    assert abajo == pytest.approx(29.6)


def test_redondeo_js_de_los_medios():
    # Math.round(0.5) = 1, Math.round(2.5) = 3 y Math.round(-0.5) = -0 (no el redondeo bancario de Python)
    assert _js_round(0.5) == 1 and _js_round(2.5) == 3 and _js_round(-0.5) == 0 and _js_round(-1.5) == -1


def test_paridad_con_findingMeasurements_de_typescript():
    # Valor de referencia calculado con findingMeasurements (src/lib/blade/measure.ts) para la misma entrada
    m = finding_measurements([[0.4137, 0.2211], [0.4719, 0.3053]], 5280, 3956, 0.73, 41.37)
    assert m["width_mm"] == 224.32608
    assert m["length_mm"] == 243.159496
    assert m["area_mm2"] == 54547.016552
    assert m["radius_m"] == 42.05
