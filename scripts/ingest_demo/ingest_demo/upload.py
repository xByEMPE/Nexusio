"""Subida reanudable (TUS) a Supabase Storage."""
from __future__ import annotations

from pathlib import Path

from tusclient import client

BUCKET = "inspection-media"
CHUNK_SIZE = 6 * 1024 * 1024
# Cabecera Cache-Control (max-age) de los objetos: 6 meses (180 días) en segundos. Con ella el CDN de Supabase y
# el navegador conservan las imágenes, lo que reduce el egress sin caché (cached egress). Solo sirve para
# objetos nuevos o resubidos: no cambia los ya existentes.
CACHE_CONTROL = "15552000"


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
    uploader.upload()
