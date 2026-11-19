"""Ciclo del worker: toma un lote de fotos pendientes, las procesa una a una y registra cada resultado.

Sin torch: el detector llega inyectado (`detector(image_bytes) -> (detecciones, ancho, alto)`), así que todo
esto se prueba con dobles. Una foto que falla se registra 'failed' y el ciclo continúa con la siguiente.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, Protocol

from .config import Config
from .errors import safe_error
from .manifest import build_manifest

log = logging.getLogger("nexus.worker")

Detector = Callable[[bytes], "tuple[list[dict], int, int]"]


class Client(Protocol):
    def pending(self, limit: int) -> list[dict]: ...
    def start(self, capture_id: str, model: str, version: str) -> dict: ...
    def download(self, path: str) -> bytes: ...
    def record(self, manifest, capture_id: str, model: str, version: str, error=None) -> dict: ...


@dataclass
class CycleStats:
    found: int = 0
    done: int = 0
    failed: int = 0
    findings: int = 0
    bytes_downloaded: int = 0


class DimensionMismatch(ValueError):
    pass


def check_dimensions(capture: dict, img_w: int, img_h: int) -> None:
    """La imagen decodificada (ya con la orientación EXIF aplicada) debe medir lo que dice la captura.
    Si no, las cajas y las medidas no serían fiables: la foto se registra failed con un mensaje claro."""
    w, h = int(capture["width_px"]), int(capture["height_px"])
    if (img_w, img_h) == (w, h):
        return
    note = " (ancho y alto intercambiados: orientación)" if (img_w, img_h) == (h, w) else ""
    raise DimensionMismatch(f"dimensiones de la imagen {img_w}x{img_h} distintas de la captura {w}x{h}{note}")


def process_capture(client: Client, detector: Detector, cfg: Config, capture: dict, stats: CycleStats) -> None:
    """Descarga, detecta y registra una foto. Lanza si algo falla (run_cycle lo registra como failed)."""
    # Primero se cuenta el intento (si el proceso muere a mitad, tras 3 intentos la foto se rinde)
    if client.start(capture["capture_id"], cfg.model_name, cfg.model_version).get("status") == "already_done":
        log.info("Foto %s ya estaba procesada; no se descarga", capture["capture_id"])
        return
    data = client.download(capture["original_path"])
    stats.bytes_downloaded += len(data)
    detections, img_w, img_h = detector(data)
    del data
    check_dimensions(capture, img_w, img_h)
    manifest = build_manifest(capture, detections, img_w, img_h, cfg.model_name, cfg.model_version)
    n = len(manifest["findings"]) if manifest else 0
    client.record(manifest, capture["capture_id"], cfg.model_name, cfg.model_version)
    stats.done += 1
    stats.findings += n
    log.info("Foto %s procesada: %d daños", capture["capture_id"], n)


def run_cycle(client: Client, detector: Detector, cfg: Config) -> CycleStats:
    stats = CycleStats()
    pending = client.pending(cfg.batch_size)
    stats.found = len(pending)
    secrets = (cfg.worker_email, cfg.worker_password, cfg.sb_publishable_key)
    for capture in pending:
        try:
            process_capture(client, detector, cfg, capture, stats)
        except Exception as exc:  # noqa: BLE001 - una foto mala no detiene el ciclo
            message = safe_error(exc, secrets)
            log.error("Foto %s falló: %s", capture.get("capture_id"), message)
            stats.failed += 1
            try:
                client.record(None, capture["capture_id"], cfg.model_name, cfg.model_version, error=message)
            except Exception as exc2:  # noqa: BLE001
                log.error("No se pudo registrar el fallo de %s: %s", capture.get("capture_id"), safe_error(exc2, secrets))
    log.info(
        "Ciclo: %d encontradas, %d hechas, %d fallidas, %d daños, %.2f MB descargados",
        stats.found, stats.done, stats.failed, stats.findings, stats.bytes_downloaded / 1_048_576,
    )
    return stats


def serve(
    client: Client,
    detector: Detector,
    cfg: Config,
    sleep: Callable[[float], None] = time.sleep,
    max_cycles: int | None = None,
) -> None:
    """Bucle principal: un ciclo a la vez. Con trabajo, pausa corta entre lotes; sin trabajo, sondeo cada poll_seconds."""
    secrets = (cfg.worker_email, cfg.worker_password, cfg.sb_publishable_key)
    cycles = 0
    while max_cycles is None or cycles < max_cycles:
        cycles += 1
        try:
            stats = run_cycle(client, detector, cfg)
            wait = cfg.pause_seconds if stats.found >= cfg.batch_size else cfg.poll_seconds
            if stats.found == 0:
                wait = cfg.poll_seconds
        except Exception as exc:  # noqa: BLE001 - fallo al listar (red, sesión): se reintenta en el siguiente sondeo
            log.error("Ciclo fallido: %s", safe_error(exc, secrets))
            wait = cfg.poll_seconds
        sleep(wait)
