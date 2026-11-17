import base64
import importlib
import json
import sys
from pathlib import Path

import pytest

from nexus_desktop import config


@pytest.fixture
def reload_config():
    """Recarga config.py con el entorno de la prueba y deja los valores de antes al terminar
    (los demás módulos leen config.SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY)."""
    saved = (config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY)
    yield lambda: importlib.reload(config)
    config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY = saved


@pytest.fixture
def appdata(monkeypatch, tmp_path):
    """%APPDATA% de prueba (sin config.json salvo que la prueba lo escriba)."""
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.delenv("NEXUS_SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXUS_PUBLISHABLE_KEY", raising=False)
    return tmp_path


def write_user_config(appdata: Path, data) -> Path:
    path = appdata / "NEXUS" / "config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")
    return path


def jwt(role: str) -> str:
    def part(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    return f"{part({'alg': 'HS256', 'typ': 'JWT'})}.{part({'role': role})}.firma"


def test_config_defaults(appdata, reload_config):
    cfg = reload_config()
    assert cfg.SUPABASE_URL == "http://127.0.0.1:54321"
    assert cfg.SUPABASE_PUBLISHABLE_KEY == ""
    assert cfg.APP_NAME == "nexus-desktop"
    assert isinstance(cfg.VERSION, str) and cfg.VERSION


def test_user_config_path_is_under_data_dir(appdata):
    assert config.user_config_path() == appdata / "NEXUS" / "config.json"


def test_user_config_file_supplies_url_and_key(appdata, reload_config):
    write_user_config(appdata, {"supabase_url": "https://ejemplo.supabase.co",
                                "supabase_publishable_key": "sb_publishable_prueba"})
    cfg = reload_config()
    assert cfg.SUPABASE_URL == "https://ejemplo.supabase.co"
    assert cfg.SUPABASE_PUBLISHABLE_KEY == "sb_publishable_prueba"


def test_env_vars_win_over_user_config_file(appdata, monkeypatch, reload_config):
    write_user_config(appdata, {"supabase_url": "https://archivo.example",
                                "supabase_publishable_key": "sb_publishable_archivo"})
    monkeypatch.setenv("NEXUS_SUPABASE_URL", "http://127.0.0.1:9999")
    monkeypatch.setenv("NEXUS_PUBLISHABLE_KEY", "sb_publishable_entorno")
    cfg = reload_config()
    assert cfg.SUPABASE_URL == "http://127.0.0.1:9999"
    assert cfg.SUPABASE_PUBLISHABLE_KEY == "sb_publishable_entorno"


@pytest.mark.parametrize("content", ["{no es json", "[1, 2]", '{"supabase_url": 5}', ""])
def test_broken_user_config_file_is_ignored(appdata, reload_config, content):
    write_user_config(appdata, content)
    cfg = reload_config()
    assert cfg.SUPABASE_URL == "http://127.0.0.1:54321"
    assert cfg.SUPABASE_PUBLISHABLE_KEY == ""


@pytest.mark.parametrize("key", ["sb_secret_abc123", jwt("service_role"), jwt("authenticated")])
def test_non_public_keys_are_refused(appdata, monkeypatch, reload_config, key):
    """Solo se acepta la llave pública: una llave secreta (sb_secret_… o un JWT que no sea de
    rol anon) se descarta venga del archivo o de la variable de entorno."""
    write_user_config(appdata, {"supabase_publishable_key": key})
    assert reload_config().SUPABASE_PUBLISHABLE_KEY == ""
    monkeypatch.setenv("NEXUS_PUBLISHABLE_KEY", key)
    assert reload_config().SUPABASE_PUBLISHABLE_KEY == ""


def test_legacy_anon_jwt_is_accepted(appdata, monkeypatch, reload_config):
    monkeypatch.setenv("NEXUS_PUBLISHABLE_KEY", jwt("anon"))
    assert reload_config().SUPABASE_PUBLISHABLE_KEY == jwt("anon")


@pytest.fixture
def frozen(monkeypatch, tmp_path):
    """Simula la app empaquetada con PyInstaller (carpeta única):
    <tmp>/NEXUS-Importador.exe y los datos en <tmp>/_internal (sys._MEIPASS)."""
    internal = tmp_path / "_internal"
    internal.mkdir()
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(internal), raising=False)
    monkeypatch.setattr(sys, "executable", str(tmp_path / "NEXUS-Importador.exe"))
    return tmp_path


def touch(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")
    return path


def test_resolve_exiftool_env_then_path(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "bundle_dirs", lambda: [])
    exe = touch(tmp_path / "exiftool.exe")
    monkeypatch.setenv("NEXUS_EXIFTOOL", str(exe))
    assert config.resolve_exiftool() == exe

    monkeypatch.setenv("NEXUS_EXIFTOOL", str(tmp_path / "no-existe.exe"))
    monkeypatch.setattr(config.shutil, "which", lambda name: str(tmp_path / "en-path" / "exiftool.exe"))
    assert config.resolve_exiftool() == tmp_path / "en-path" / "exiftool.exe"

    monkeypatch.delenv("NEXUS_EXIFTOOL")
    monkeypatch.setattr(config.shutil, "which", lambda name: None)
    assert config.resolve_exiftool() is None


def test_bundle_dirs_when_frozen(frozen):
    assert config.bundle_dirs() == [frozen / "_internal", frozen]


def test_bundle_dirs_when_not_frozen(monkeypatch):
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.delattr(sys, "_MEIPASS", raising=False)
    assert config.bundle_dirs() == [Path(sys.executable).resolve().parent]


def test_resolve_exiftool_order_env_bundled_path(frozen, monkeypatch, tmp_path):
    """Orden: NEXUS_EXIFTOOL → exiftool incluido con la app → PATH."""
    in_path = tmp_path / "en-path" / "exiftool.exe"
    monkeypatch.setattr(config.shutil, "which", lambda name: str(in_path))
    env_exe = touch(tmp_path / "propio" / "exiftool.exe")
    bundled = touch(frozen / "_internal" / "exiftool" / "exiftool.exe")

    monkeypatch.setenv("NEXUS_EXIFTOOL", str(env_exe))
    assert config.resolve_exiftool() == env_exe

    monkeypatch.delenv("NEXUS_EXIFTOOL")
    assert config.resolve_exiftool() == bundled

    bundled.unlink()
    assert config.resolve_exiftool() == in_path


def test_resolve_exiftool_next_to_executable(frozen, monkeypatch):
    """También vale un exiftool/ junto al .exe (fuera de _internal)."""
    monkeypatch.delenv("NEXUS_EXIFTOOL", raising=False)
    monkeypatch.setattr(config.shutil, "which", lambda name: None)
    next_to_exe = touch(frozen / "exiftool" / "exiftool.exe")
    assert config.resolve_exiftool() == next_to_exe


def test_model_search_paths_order(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_MODEL_PATH", str(tmp_path / "m.onnx"))
    paths = config.model_search_paths()
    assert paths[0] == tmp_path / "m.onnx"
    assert Path(config.__file__).resolve().parent.parent / "models" / config.MODEL_FILE in paths
    assert Path(sys.executable).resolve().parent / config.MODEL_FILE in paths
    monkeypatch.delenv("NEXUS_MODEL_PATH")
    assert tmp_path / "m.onnx" not in config.model_search_paths()


def test_model_search_paths_find_bundled_model_when_frozen(frozen, monkeypatch):
    monkeypatch.delenv("NEXUS_MODEL_PATH", raising=False)
    paths = config.model_search_paths()
    assert frozen / "_internal" / "models" / config.MODEL_FILE in paths
    assert frozen / "models" / config.MODEL_FILE in paths
