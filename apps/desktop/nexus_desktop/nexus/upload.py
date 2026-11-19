"""Subida reanudable (TUS) a Supabase Storage."""
from __future__ import annotations

from pathlib import Path

from tusclient import client
from tusclient.exceptions import TusCommunicationError

BUCKET = "inspection-media"
CHUNK_SIZE = 6 * 1024 * 1024


FORBIDDEN_TEXT = ("No tienes permiso para subir a esta inspección: puede estar siendo eliminada o ya "
                  "aprobada. No reintentes; pide ayuda a un administrador.")


class StorageForbidden(Exception):
    """Storage rechazó la subida por la política de seguridad (403 / row-level security): terminal,
    reintentar no ayuda. Un fallo de red u otro estado HTTP sí admite reintento y no usa esta clase."""


def _is_policy_denial(exc: TusCommunicationError) -> bool:
    body = str(getattr(exc, "response_content", "") or "").lower()
    return exc.status_code == 403 and ("row-level security" in body or "violates" in body)


def tus_upload(path: Path, object_name: str, content_type: str, *, supabase_url: str,
               access_token: str, publishable_key: str) -> None:
    tus = client.TusClient(
        f"{supabase_url.rstrip('/')}/storage/v1/upload/resumable",
        headers={"authorization": f"Bearer {access_token}", "apikey": publishable_key, "x-upsert": "true"},
    )
    uploader = tus.uploader(
        str(path), chunk_size=CHUNK_SIZE,
        metadata={"bucketName": BUCKET, "objectName": object_name,
                  "contentType": content_type, "cacheControl": "3600"},
    )
    try:
        uploader.upload()
    except TusCommunicationError as exc:
        if _is_policy_denial(exc):
            raise StorageForbidden(FORBIDDEN_TEXT) from None  # sin la respuesta cruda (podría llevar datos)
        raise
