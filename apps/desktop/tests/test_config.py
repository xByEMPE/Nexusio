import importlib

from nexus_desktop import config


def test_config_defaults(monkeypatch):
    monkeypatch.delenv("NEXUS_SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXUS_PUBLISHABLE_KEY", raising=False)
    cfg = importlib.reload(config)
    assert cfg.SUPABASE_URL == "http://127.0.0.1:54321"
    assert cfg.APP_NAME == "nexus-desktop"
    assert isinstance(cfg.VERSION, str) and cfg.VERSION


def test_resolve_exiftool_env_then_path(monkeypatch, tmp_path):
    exe = tmp_path / "exiftool.exe"
    exe.write_bytes(b"")
    monkeypatch.setenv("NEXUS_EXIFTOOL", str(exe))
    assert config.resolve_exiftool() == exe

    monkeypatch.setenv("NEXUS_EXIFTOOL", str(tmp_path / "no-existe.exe"))
    monkeypatch.setattr(config.shutil, "which", lambda name: str(tmp_path / "en-path" / "exiftool.exe"))
    assert config.resolve_exiftool() == tmp_path / "en-path" / "exiftool.exe"

    monkeypatch.delenv("NEXUS_EXIFTOOL")
    monkeypatch.setattr(config.shutil, "which", lambda name: None)
    assert config.resolve_exiftool() is None


def test_model_search_paths_order(monkeypatch, tmp_path):
    import sys
    from pathlib import Path

    monkeypatch.setenv("NEXUS_MODEL_PATH", str(tmp_path / "m.onnx"))
    paths = config.model_search_paths()
    assert paths[0] == tmp_path / "m.onnx"
    assert Path(config.__file__).resolve().parent.parent / "models" / config.MODEL_FILE in paths
    assert Path(sys.executable).resolve().parent / config.MODEL_FILE in paths
    monkeypatch.delenv("NEXUS_MODEL_PATH")
    assert tmp_path / "m.onnx" not in config.model_search_paths()
