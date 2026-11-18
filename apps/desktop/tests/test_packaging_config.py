"""El instalador deja config.json de %APPDATA% (solo valores públicos) y build.ps1 lo valida
con las mismas reglas que config.py. Sin llaves reales en el repositorio."""
import base64
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from nexus_desktop import config

DESKTOP = Path(__file__).resolve().parent.parent
PACKAGING = DESKTOP / "packaging"
BUILD_PS1 = PACKAGING / "build.ps1"
INSTALLER = PACKAGING / "installer.iss"

POWERSHELL = shutil.which("powershell.exe") or shutil.which("powershell")


def _jwt(role: str) -> str:
    def seg(obj) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")
    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.firmafirmafirma"


# (nombre, url, llave)
CASES = [
    ("llave publicable + https", "https://ejemplo.invalid", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("llave secreta", "https://ejemplo.invalid", "sb_secret_" + "abcdefghijklmnopqrstuvwx"),
    ("jwt anon", "https://ejemplo.invalid", _jwt("anon")),
    ("jwt service_role", "https://ejemplo.invalid", _jwt("service_role")),
    ("jwt authenticated", "https://ejemplo.invalid", _jwt("authenticated")),
    ("http remoto", "http://ejemplo.invalid", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("http localhost", "http://localhost:54321", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("http 127.0.0.1", "http://127.0.0.1:54321", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("http ipv6 local", "http://[::1]:54321", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("jwt ANON en mayúsculas", "https://ejemplo.invalid", _jwt("ANON")),
    ("url con usuario y clave", "https://usuario:clave@ejemplo.invalid", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("url con usuario sin clave", "https://usuario@ejemplo.invalid", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("llave con espacio interno", "https://ejemplo.invalid", "sb_publishable_" + "abcdefghij klmnopqrstuvwx"),
    ("llave con salto de línea", "https://ejemplo.invalid", "sb_publishable_" + "abcdefghij" + chr(10) + "klmnopqrstuvwx"),
    ("sin esquema", "ejemplo.invalid", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
]


def test_installer_installs_config_without_clobbering_or_admin():
    text = INSTALLER.read_text(encoding="utf-8-sig")
    line = next((ln for ln in text.splitlines() if "config.json" in ln and ln.lstrip().startswith("Source:")), "")
    assert line, "installer.iss debe instalar config.json en [Files]"
    assert "{userappdata}" + chr(92) + "NEXUS" in line
    assert "onlyifdoesntexist" in line
    assert "uninsneveruninstall" in line
    assert re.search(r"(?im)^PrivilegesRequired=lowest\s*$", text)
    assert not re.search(r"(?i)PrivilegesRequired=admin", text)
    assert "#ifexist" in text.lower() or "#if fileexists" in text.lower()


_KEY_PATTERNS = [
    re.compile(r"sb_publishable_[A-Za-z0-9]{20,}"),
    re.compile(r"sb_secret_[A-Za-z0-9]{20,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
]


# Fixture ficticio ya existente (JWT inventado sin firma real) que comprueba que el registro lo
# oculta: solo se admite en ESTE archivo y con ESTE valor exacto.
_KNOWN_FAKE_FIXTURES = {
    "apps/desktop/tests/test_applog.py":
        ["eyJhbGciOiJIUzI1NiJ9." + "eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9." + "c2VjcmV0b2Zpcm1h"],
}


def scan_for_keys(files, allowed=None):
    """Rutas (relativas) de `files` = [(ruta relativa, Path)] con aspecto de llave real."""
    allowed = allowed or {}
    offenders = []
    for rel, path in files:
        if not path.is_file():
            continue
        text = path.read_bytes().decode("utf-8", errors="ignore")
        for fake in allowed.get(rel, []):
            text = text.replace(fake, "")
        if any(p.search(text) for p in _KEY_PATTERNS):
            offenders.append(rel)
    return offenders


def test_no_real_looking_keys_in_versioned_desktop_tree():
    root = DESKTOP.parent.parent
    out = subprocess.run(["git", "ls-files", "apps/desktop"], cwd=root, capture_output=True,
                         text=True, check=True).stdout.splitlines()
    assert BUILD_PS1.name in " ".join(out)
    files = [(rel, root / rel) for rel in out if rel]
    assert scan_for_keys(files, _KNOWN_FAKE_FIXTURES) == []


def test_key_scan_detects_real_looking_keys_and_exception_is_narrow(tmp_path):
    pub = tmp_path / "a.txt"
    pub.write_text("k = sb_publishable_" + "A1b2C3d4E5f6G7h8I9j0K1", encoding="utf-8")
    sec = tmp_path / "b.txt"
    sec.write_text("sb_secret_" + "A1b2C3d4E5f6G7h8I9j0K1", encoding="utf-8")
    jwt = tmp_path / "c.txt"
    jwt.write_text(_jwt("service_role"), encoding="utf-8")
    ok = tmp_path / "d.txt"
    ok.write_text("sb_publishable_prueba y sb_secret_x", encoding="utf-8")
    files = [("a.txt", pub), ("b.txt", sec), ("c.txt", jwt), ("d.txt", ok)]
    assert scan_for_keys(files) == ["a.txt", "b.txt", "c.txt"]
    # la excepción vale solo para su ruta y su valor exacto
    fake = _KNOWN_FAKE_FIXTURES["apps/desktop/tests/test_applog.py"][0]
    other = tmp_path / "e.txt"
    other.write_text(fake, encoding="utf-8")
    assert scan_for_keys([("e.txt", other)], _KNOWN_FAKE_FIXTURES) == ["e.txt"]
    assert scan_for_keys([("apps/desktop/tests/test_applog.py", other)], _KNOWN_FAKE_FIXTURES) == []
    other.write_text(_jwt("anon"), encoding="utf-8")
    assert scan_for_keys([("apps/desktop/tests/test_applog.py", other)], _KNOWN_FAKE_FIXTURES) != []


def _run_script(tmp_path, url, key):
    out = tmp_path / "out"
    proc = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(BUILD_PS1),
         "-ValidateOnly", "-OutDir", str(out), "-SupabaseUrl", url, "-PublishableKey", key],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
    )
    return proc, out


@pytest.mark.skipif(POWERSHELL is None, reason="sin powershell.exe")
@pytest.mark.parametrize("name,url,key", CASES, ids=[c[0] for c in CASES])
def test_build_script_validation_matches_config_py(tmp_path, name, url, key):
    expected = config._is_public_key(key) and config._is_safe_url(url)
    proc, out = _run_script(tmp_path, url, key)
    assert (proc.returncode == 0) == expected, proc.stdout + proc.stderr
    assert key not in proc.stdout + proc.stderr  # nunca se imprime la llave completa
    cfg = out / "config.json"
    if expected:
        raw = cfg.read_bytes()
        assert not raw.startswith(b"\xef\xbb\xbf")  # UTF-8 sin BOM
        assert json.loads(raw.decode("utf-8")) == {"supabase_url": url, "supabase_publishable_key": key}
    else:
        assert not cfg.exists()


@pytest.mark.skipif(POWERSHELL is None, reason="sin powershell.exe")
def test_build_script_without_params_only_warns(tmp_path, monkeypatch):
    monkeypatch.delenv("NEXUS_SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXUS_PUBLISHABLE_KEY", raising=False)
    out = tmp_path / "out"
    proc = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(BUILD_PS1),
         "-ValidateOnly", "-OutDir", str(out)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "AVISO" in proc.stdout and "config.json" in proc.stdout  # (acentos según la consola)
    assert not (out / "config.json").exists()


@pytest.mark.skipif(POWERSHELL is None, reason="sin powershell.exe")
def test_build_script_reads_environment_fallback(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXUS_SUPABASE_URL", "https://ejemplo.invalid")
    monkeypatch.setenv("NEXUS_PUBLISHABLE_KEY", "sb_publishable_" + "abcdefghijklmnopqrstuvwx")
    out = tmp_path / "out"
    proc = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(BUILD_PS1),
         "-ValidateOnly", "-OutDir", str(out)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert json.loads((out / "config.json").read_text(encoding="utf-8"))["supabase_url"] == "https://ejemplo.invalid"


FAKE_SECRET = "sb_secret_" + "ZXCVBNMASDFGHJKLQWERTYUIOP1234567890"


@pytest.mark.skipif(POWERSHELL is None, reason="sin powershell.exe")
@pytest.mark.parametrize("url,key", [
    (FAKE_SECRET, "https://x.invalid"),  # parámetros cruzados
    ("https://usuario:" + "claveMuySecreta987@ejemplo.invalid/ruta", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
    ("https://ejemplo.invalid", FAKE_SECRET),
    ("http://ejemplo.invalid/algo?token=" + "abcdef123456", "sb_publishable_" + "abcdefghijklmnopqrstuvwx"),
], ids=["cruzados", "url con clave", "llave secreta", "http remoto con ruta"])
def test_build_script_never_echoes_rejected_values(tmp_path, url, key):
    proc, _ = _run_script(tmp_path, url, key)
    assert proc.returncode != 0
    shown = proc.stdout + proc.stderr
    for secret in (FAKE_SECRET, "claveMuySecreta987", "abcdef123456", key, url):
        assert secret not in shown


@pytest.mark.skipif(POWERSHELL is None, reason="sin powershell.exe")
def test_build_script_valid_run_prints_only_scheme_and_host(tmp_path):
    key = "sb_publishable_" + "abcdefghijklmnopqrstuvwx"
    proc, _ = _run_script(tmp_path, "https://ejemplo.invalid/ruta/larga", key)
    assert proc.returncode == 0
    assert "https://ejemplo.invalid" in proc.stdout and "ruta" not in proc.stdout
    assert key not in proc.stdout


def test_missing_key_message_mentions_existing_file_and_invalid_file_is_distinguished(
        tmp_path, monkeypatch):
    from nexus_desktop import config
    from nexus_desktop.ui import app as app_module

    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.setattr(config, "SUPABASE_PUBLISHABLE_KEY", "")
    monkeypatch.setattr(config, "CONFIG_ERROR", None)
    assert "no lo reemplaza" in app_module.MISSING_KEY
    _, error = app_module.create_session()  # sin archivo
    assert error.startswith("Falta la llave")
    path = tmp_path / "NEXUS" / "config.json"
    path.parent.mkdir()
    for content in ("{no es json: sb_secret_" + "AAAAAAAAAAAAAAAAAAAAAAAA", '{"supabase_url": "https://x.invalid"}'):
        path.write_text(content, encoding="utf-8")
        _, error = app_module.create_session()
        assert "existe pero no es válido" in error and str(path) in error
        assert "sb_secret_" not in error and "x.invalid" not in error
