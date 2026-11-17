from nexus_desktop.domain.measurement import (
    radius_from_altitude, reference_root_altitude, sequence_direction,
)


def test_reference_root_prefers_le_te_minimum():
    photos = [("LE", 12.0), ("TE", 10.0), ("PS", 2.0), ("SS", 3.0)]
    assert reference_root_altitude(photos) == 10.0


def test_reference_root_falls_back_to_global_min():
    assert reference_root_altitude([("PS", 5.0), ("SS", 3.0)]) == 3.0


def test_reference_root_no_data_is_zero():
    assert reference_root_altitude([]) == 0.0


def test_radius_scales_to_blade_length():
    assert radius_from_altitude(10, 0, 20, 60) == 30


def test_radius_without_tip_is_altitude_difference():
    assert radius_from_altitude(15, 5, None, 60) == 10


def test_radius_clamped_to_blade_length():
    assert radius_from_altitude(100, 0, None, 60) == 60
    assert radius_from_altitude(40, 0, 20, 60) == 60


def test_radius_never_negative():
    assert radius_from_altitude(-5, 0, None, 60) == 0.0


def test_sequence_direction_detects_both_ways_and_unknown():
    assert sequence_direction([1.0, 5.0, 9.0]) == "root_to_tip"
    assert sequence_direction([9.0, 5.0, 1.0]) == "tip_to_root"
    assert sequence_direction([1.0, 9.0, 5.0]) == "unknown"
    assert sequence_direction([3.0]) == "unknown"
    assert sequence_direction([]) == "unknown"


# --- Decisiones de la Task 13 (datos reales de WTG 25) ------------------------------------------

def test_radius_with_tip_below_root_altitude_is_zero_not_mirrored():
    # WTG 25 C/SS: la última foto (102,07 m) queda bajo la raíz de referencia (102,78 m, mínima
    # LE/TE). Con |alt − raíz| salía radio 0,71 m y una vuelta atrás falsa de 0,62 m.
    assert radius_from_altitude(102.07, 102.78, 139.55, 37.0) == 0.0


def test_radius_blade_pointing_down_scales_by_signed_ratio():
    # Pala hacia abajo (punta bajo la raíz): radio = (raíz − alt) / (raíz − punta) · longitud.
    assert radius_from_altitude(90.0, 100.0, 60.0, 40.0) == 10.0
    assert radius_from_altitude(105.0, 100.0, 60.0, 40.0) == 0.0  # por encima de la raíz


def test_radius_degenerate_tip_uses_legacy_threshold():
    # Punta a menos de 0,1 m de la raíz (umbral de interpolate_radius): no se escala.
    assert radius_from_altitude(15.0, 5.0, 5.05, 60.0) == 10.0
    assert radius_from_altitude(15.0, 5.0, 5.2, 60.0) == 60.0  # 0,2 m sí escala (y se acota)


def test_sequence_direction_tolerates_gps_jitter():
    # Saltos atrás de pocos centímetros (WTG 25: máx. 0,047 m en altitud) no anulan el sentido.
    assert sequence_direction([0.0, 3.0, 2.9, 6.0, 9.0]) == "root_to_tip"
    assert sequence_direction([37.0, 33.9, 34.2, 30.0, 0.0]) == "tip_to_root"
    # Un retroceso real (más que la tolerancia) sigue siendo "unknown".
    assert sequence_direction([0.0, 5.0, 3.0, 9.0]) == "unknown"
    # Sin cambio neto apreciable: "unknown".
    assert sequence_direction([5.0, 5.2, 5.1]) == "unknown"
    assert sequence_direction([0.0, 1.0, 0.0], tolerance_m=0.0) == "unknown"
