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
