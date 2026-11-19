"""Configuración desde variables de entorno (secretos del Space). Nunca se registran las credenciales."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping

APP_NAME = "nexus-hf-detector"
APP_VERSION = "2.0.0"
BUCKET = "inspection-media"
MAX_ATTEMPTS = 3  # debe coincidir con ai_pending_captures (attempts < 3)


class ConfigError(RuntimeError):
    pass


def _int(env: Mapping[str, str], key: str, default: int, minimum: int, maximum: int) -> int:
    raw = env.get(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{key} debe ser un entero") from exc
    if not minimum <= value <= maximum:
        raise ConfigError(f"{key} debe estar entre {minimum} y {maximum}")
    return value


@dataclass(frozen=True)
class Config:
    sb_url: str
    sb_publishable_key: str = field(repr=False)
    worker_email: str = field(repr=False)
    worker_password: str = field(repr=False)
    batch_size: int = 10
    poll_seconds: int = 60
    pause_seconds: int = 5
    model_name: str = "fasterrcnn-resnet50-fpn"
    model_version: str = "1.0.0"

    def __repr__(self) -> str:  # sin credenciales ni llaves
        return (
            f"Config(sb_url={self.sb_url!r}, batch_size={self.batch_size}, poll_seconds={self.poll_seconds}, "
            f"pause_seconds={self.pause_seconds}, model={self.model_name}@{self.model_version})"
        )


def load_config(env: Mapping[str, str] | None = None) -> Config:
    env = os.environ if env is None else env
    required = ("SB_URL", "SB_PUBLISHABLE_KEY", "NEXUS_WORKER_EMAIL", "NEXUS_WORKER_PASSWORD")
    missing = [k for k in required if not env.get(k)]
    if missing:
        raise ConfigError("Faltan secretos: " + ", ".join(missing))
    return Config(
        sb_url=env["SB_URL"].strip().rstrip("/"),
        sb_publishable_key=env["SB_PUBLISHABLE_KEY"].strip(),
        worker_email=env["NEXUS_WORKER_EMAIL"].strip(),
        worker_password=env["NEXUS_WORKER_PASSWORD"],
        batch_size=_int(env, "AI_BATCH_SIZE", 10, 1, 100),
        poll_seconds=_int(env, "AI_POLL_SECONDS", 60, 5, 3600),
        pause_seconds=_int(env, "AI_BATCH_PAUSE_SECONDS", 5, 0, 600),
        model_name=(env.get("AI_MODEL_NAME") or "fasterrcnn-resnet50-fpn").strip(),
        model_version=(env.get("AI_MODEL_VERSION") or "1.0.0").strip(),
    )
