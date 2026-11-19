"""Construcción del manifiesto de subida v1 (src/contracts/ingest-manifest.v1.schema.json) para una foto."""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from .config import APP_NAME, APP_VERSION
from .measurements import finding_measurements

# Tipo genérico sembrado por la migración ai_runs: el modelo solo da la categoría (= severidad)
TYPE_CODE = "ai_unclassified"
# Espacio de nombres fijo de los ids deterministas (no cambiar: rompería la idempotencia)
FINDING_NAMESPACE = uuid.UUID("6f3a9c1e-5b7d-4e2a-8c4f-0d1b2a3c4d5e")
MIN_SIDE = 1e-4  # lado mínimo de una caja normalizada (0,01 % de la foto)


def finding_id(capture_id: str, index: int, model_version: str) -> str:
    """uuid5(capture_id + índice + versión del modelo): reprocesar con el mismo modelo da los mismos ids."""
    return str(uuid.uuid5(FINDING_NAMESPACE, f"{str(capture_id).lower()}:{index}:{model_version}"))


def clip_box(box: Iterable[float], img_w: int, img_h: int) -> Optional[list[list[float]]]:
    """Caja en px [x1,y1,x2,y2] -> dos puntos normalizados 0-1, recortada al borde de la imagen.

    Devuelve None si queda fuera, es degenerada o tiene valores no finitos.
    """
    try:
        x1, y1, x2, y2 = (float(v) for v in box)
    except (TypeError, ValueError):
        return None
    if img_w <= 0 or img_h <= 0 or not all(math.isfinite(v) for v in (x1, y1, x2, y2)):
        return None
    if x1 > x2:
        x1, x2 = x2, x1
    if y1 > y2:
        y1, y2 = y2, y1
    nx1 = min(max(x1 / img_w, 0.0), 1.0)
    nx2 = min(max(x2 / img_w, 0.0), 1.0)
    ny1 = min(max(y1 / img_h, 0.0), 1.0)
    ny2 = min(max(y2 / img_h, 0.0), 1.0)
    if (nx2 - nx1) < MIN_SIDE or (ny2 - ny1) < MIN_SIDE:
        return None
    return [[round(nx1, 6), round(ny1, 6)], [round(nx2, 6), round(ny2, 6)]]


def sort_detections(detections: list[dict]) -> list[dict]:
    """Orden estable e independiente del orden de llegada: los índices (y los ids) no cambian entre ejecuciones."""
    return sorted(
        detections,
        key=lambda d: (-float(d["score"]), [round(float(v), 2) for v in d["box"]], int(d["label"])),
    )


def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def build_manifest(
    capture: dict,
    detections: list[dict],
    img_w: int,
    img_h: int,
    model_name: str,
    model_version: str,
    now: Optional[datetime] = None,
) -> Optional[dict]:
    """Manifiesto con los daños de la foto, o None si no queda ninguno válido (entonces solo se marca el run).

    `capture`: fila de ai_pending_captures. `detections`: [{box:[x1,y1,x2,y2] en px, score, label 1-5}].
    Las cajas se normalizan sobre el tamaño real de la imagen decodificada (img_w, img_h) y las medidas se
    calculan con el tamaño y el GSD de la captura guardada.
    """
    findings = []
    for index, det in enumerate(sort_detections(detections)):
        region = clip_box(det["box"], img_w, img_h)
        severity = int(det["label"])
        score = float(det["score"])
        if region is None or not 1 <= severity <= 5 or not math.isfinite(score):
            continue
        finding: dict[str, Any] = {
            # El índice es el de la lista ordenada completa (no el de las válidas): estable aunque se recorte alguna
            "id": finding_id(capture["capture_id"], index, model_version),
            "capture_id": capture["capture_id"],
            "type_code": TYPE_CODE,
            "severity": severity,
            "region": {"type": "box", "points": region},
            "source": "ai",
            "ai": {"confidence": round(min(max(score, 0.0), 1.0), 4), "model": model_name, "version": model_version},
        }
        m = finding_measurements(
            region,
            int(capture["width_px"]),
            int(capture["height_px"]),
            _num(capture.get("gsd_mm_px")),
            _num(capture.get("radius_center_m")),
        )
        if m is not None:
            finding["measurements"] = m
        findings.append(finding)
    if not findings:
        return None
    return {
        "manifest_version": 1,
        "generated_at": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "app": {"name": APP_NAME, "version": APP_VERSION},
        "project_id": capture["project_id"],
        "inspection": {
            "id": capture["inspection_id"],
            "asset_id": capture["asset_id"],
            "kind": capture.get("inspection_kind") or "wind_blade",
        },
        "captures": [],
        "findings": findings,
    }
