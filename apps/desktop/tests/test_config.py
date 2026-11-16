import importlib

from nexus_desktop import config


def test_config_defaults(monkeypatch):
    monkeypatch.delenv("NEXUS_SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXUS_PUBLISHABLE_KEY", raising=False)
    cfg = importlib.reload(config)
    assert cfg.SUPABASE_URL == "http://127.0.0.1:54321"
    assert cfg.APP_NAME == "nexus-desktop"
    assert isinstance(cfg.VERSION, str) and cfg.VERSION
