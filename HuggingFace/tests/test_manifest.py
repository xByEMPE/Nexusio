import copy
import uuid
from datetime import datetime, timezone

import pytest

from nexus_detector.manifest import FINDING_NAMESPACE, build_manifest, clip_box, finding_id

NOW = datetime(2026, 11, 18, 10, 0, 0, tzinfo=timezone.utc)


def det(box, score=0.9, label=3):
    return {"box": box, "score": score, "label": label}


def build(capture, detections, w=5280, h=3956, version="1.0.0"):
    return build_manifest(capture, detections, w, h, "fasterrcnn", version, now=NOW)


# --- recorte de cajas ---------------------------------------------------------------------------------------
def test_caja_dentro_se_normaliza():
    assert clip_box([528, 395.6, 1056, 791.2], 5280, 3956) == [[0.1, 0.1], [0.2, 0.2]]


def test_caja_que_sobresale_se_recorta():
    assert clip_box([-100, -50, 528, 395.6], 5280, 3956) == [[0.0, 0.0], [0.1, 0.1]]
    assert clip_box([5000, 3900, 6000, 5000], 5280, 3956) == [[0.946970, 0.985844], [1.0, 1.0]]


@pytest.mark.parametrize(
    "box",
    [
        [6000, 100, 7000, 200],  # totalmente fuera
        [-500, -500, -10, -10],
        [100, 100, 100, 200],  # sin ancho
        [100, 100, 200, 100],  # sin alto
        [float("nan"), 0, 10, 10],
        [0, 0, float("inf"), 10],
        [1, 2, 3],  # mal formada
    ],
)
def test_cajas_invalidas_se_descartan(box):
    assert clip_box(box, 5280, 3956) is None


def test_caja_con_esquinas_invertidas_se_ordena():
    assert clip_box([1056, 791.2, 528, 395.6], 5280, 3956) == [[0.1, 0.1], [0.2, 0.2]]


# --- ids deterministas --------------------------------------------------------------------------------------
def test_ids_deterministas_y_uuid5():
    a = finding_id("2D3E4F5A-6B7C-4D8E-9FA0-B1C2D3E4F5A6", 0, "1.0.0")
    assert a == finding_id("2d3e4f5a-6b7c-4d8e-9fa0-b1c2d3e4f5a6", 0, "1.0.0")
    assert uuid.UUID(a).version == 5
    assert a == str(uuid.uuid5(FINDING_NAMESPACE, "2d3e4f5a-6b7c-4d8e-9fa0-b1c2d3e4f5a6:0:1.0.0"))


def test_ids_cambian_con_indice_version_y_captura():
    base = finding_id("c1", 0, "1.0.0")
    assert len({base, finding_id("c1", 1, "1.0.0"), finding_id("c1", 0, "1.1.0"), finding_id("c2", 0, "1.0.0")}) == 4


def test_mismo_manifiesto_dos_veces_da_los_mismos_ids(capture):
    dets = [det([100, 100, 300, 300], 0.8, 2), det([1000, 1000, 1400, 1300], 0.95, 4)]
    m1 = build(capture, dets)
    m2 = build(capture, list(reversed(copy.deepcopy(dets))))  # otro orden de llegada
    assert [f["id"] for f in m1["findings"]] == [f["id"] for f in m2["findings"]]
    assert len({f["id"] for f in m1["findings"]}) == 2


# --- construcción y validez contra el esquema ---------------------------------------------------------------
def test_manifiesto_valido_contra_el_esquema(capture, schema_validator):
    dets = [det([100, 100, 300, 300], 0.8, 2), det([-20, 3900, 400, 4100], 0.55, 5)]
    m = build(capture, dets)
    errors = [e.message for e in schema_validator.iter_errors(m)]
    assert errors == []
    f = m["findings"][0]
    assert f["source"] == "ai" and f["type_code"] == "ai_unclassified"
    assert f["ai"] == {"confidence": 0.8, "model": "fasterrcnn", "version": "1.0.0"}
    assert f["region"]["type"] == "box" and len(f["region"]["points"]) == 2
    assert m["app"]["name"] == "nexus-hf-detector"
    assert m["captures"] == [] and m["generated_at"] == "2026-11-18T10:00:00Z"
    assert m["inspection"] == {
        "id": capture["inspection_id"], "asset_id": capture["asset_id"], "kind": "wind_blade",
    }


def test_severidad_y_confianza(capture, schema_validator):
    m = build(capture, [det([100, 100, 300, 300], 0.8123456, 4)])
    f = m["findings"][0]
    assert f["severity"] == 4
    assert f["ai"]["confidence"] == 0.8123
    assert not list(schema_validator.iter_errors(m))


def test_medidas_con_gsd_y_radio_de_la_captura(capture):
    m = build(capture, [det([2640, 1978, 3168, 2373.6], 0.9, 3)])
    meas = m["findings"][0]["measurements"]
    assert meas["gsd_mm_px_used"] == 0.75
    assert meas["width_mm"] == pytest.approx(0.1 * 5280 * 0.75, abs=1e-3)
    assert meas["radius_m"] is not None


def test_sin_gsd_se_omiten_las_medidas(capture, schema_validator):
    capture["gsd_mm_px"] = None
    m = build(capture, [det([100, 100, 300, 300])])
    assert "measurements" not in m["findings"][0]
    assert not list(schema_validator.iter_errors(m))


def test_sin_radio_el_radio_es_null_pero_hay_medidas(capture, schema_validator):
    capture["radius_center_m"] = None
    m = build(capture, [det([100, 100, 300, 300])])
    assert m["findings"][0]["measurements"]["radius_m"] is None
    assert not list(schema_validator.iter_errors(m))


def test_sin_detecciones_validas_no_hay_manifiesto(capture):
    assert build(capture, []) is None
    assert build(capture, [det([9000, 0, 9100, 50])]) is None  # empty_manifest se evita: solo se marca el run


def test_se_descartan_solo_las_invalidas_y_el_indice_no_se_corre(capture):
    buena = det([100, 100, 300, 300], 0.9)
    fuera = det([9000, 0, 9100, 50], 0.8)
    otra = det([1000, 1000, 1200, 1200], 0.7)
    m = build(capture, [otra, fuera, buena])
    ids = [f["id"] for f in m["findings"]]
    # orden por confianza: buena(0), fuera(1, descartada), otra(2)
    assert ids == [finding_id(capture["capture_id"], 0, "1.0.0"), finding_id(capture["capture_id"], 2, "1.0.0")]


def test_etiqueta_fuera_de_1_a_5_se_descarta(capture):
    assert build(capture, [det([100, 100, 300, 300], 0.9, 0), det([100, 100, 300, 300], 0.9, 6)]) is None


def test_la_version_del_modelo_cambia_los_ids(capture):
    a = build(capture, [det([100, 100, 300, 300])], version="1.0.0")["findings"][0]["id"]
    b = build(capture, [det([100, 100, 300, 300])], version="2.0.0")["findings"][0]["id"]
    assert a != b


def test_el_esquema_rechaza_una_caja_fuera_de_rango(capture, schema_validator):
    m = build(capture, [det([100, 100, 300, 300])])
    m["findings"][0]["region"]["points"][1][0] = 1.2
    assert list(schema_validator.iter_errors(m))
