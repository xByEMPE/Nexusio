from pathlib import Path
from unittest.mock import MagicMock, patch

from ingest_demo import upload


def test_cache_control_de_seis_meses():
    assert upload.CACHE_CONTROL == "15552000"  # 180 días en segundos


def test_tus_upload_envia_cache_control_de_seis_meses(tmp_path: Path):
    f = tmp_path / "a.webp"
    f.write_bytes(b"x")
    with patch.object(upload.client, "TusClient") as tus_cls:
        tus = tus_cls.return_value
        upload.tus_upload(f, "o/p/a.webp", "image/webp", supabase_url="http://x", access_token="t", publishable_key="k")
    metadata = tus.uploader.call_args.kwargs["metadata"]
    assert metadata["cacheControl"] == "15552000"
    assert metadata["objectName"] == "o/p/a.webp"
