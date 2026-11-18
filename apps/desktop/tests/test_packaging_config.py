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
    return f"{seg({'alg': 'HS256'})}.{seg({'role': role})}.firma"


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


# Fixture ficticio ya existente (JWT inventado sin firma real) que comprueba que el registro lo oculta.
_KNOWN_FAKE_FIXTURES = ["eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.c2VjcmV0b2Zpcm1h"]


def test_no_real_looking_keys_in_versioned_desktop_tree():
    root = DESKTOP.parent.parent
    out = subprocess.run(["git", "ls-files", "apps/desktop"], cwd=root, capture_output=True,
                         text=True, check=True).stdout.split("\n")
    assert BUILD_PS1.name in " ".join(out)
    offenders = []
    for rel in filter(None, out):
        path = root / rel
        if not path.is_file():
            continue
        try:
            text = path.read_bytes().decode("utf-8", errors="ignore")
        except OSError:
            continue
        for fake in _KNOWN_FAKE_FIXTURES:  # token de rol «authenticated» inventado de test_applog
            text = text.replace(fake, "")
        if any(p.search(text) for p in _KEY_PATTERNS):
            offenders.append(rel)
    assert offenders == [], f"patrones de llave real en: {offenders}"


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
