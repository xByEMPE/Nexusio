"""Subida reanudable (TUS) a Supabase Storage."""
from __future__ import annotations

from pathlib import Path

from tusclient import client
from tusclient.exceptions import TusCommunicationError

BUCKET = "inspection-media"
CHUNK_SIZE = 6 * 1024 * 1024
# Caché de 6 meses (180 días, en SEGUNDOS: Storage lo guarda como `max-age=<n>`) para que el CDN y el
# navegador no vuelvan a descargar imágenes ya vistas (menos egress). Es seguro porque las rutas de
# fotos llevan UUID inmutables y las de las tiras llevan la huella del contenido en el nombre
# (`strip-{sha8}.webp`): una tira reprocesada sube a una ruta nueva, nunca reescribe la vieja.
CACHE_CONTROL = "15552000"


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
                  "contentType": content_type, "cacheControl": CACHE_CONTROL},
    )
    try:
        uploader.upload()
    except TusCommunicationError as exc:
        if _is_policy_denial(exc):
            raise StorageForbidden(FORBIDDEN_TEXT) from None  # sin la respuesta cruda (podría llevar datos)
        raise
