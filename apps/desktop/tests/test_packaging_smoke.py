"""Comprobaciones previas al empaquetado: el paquete arranca sin pantalla y no arrastra textos
prohibidos (llaves de servicio, la marca anterior ni el sistema Hermes)."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

DESKTOP = Path(__file__).resolve().parents[1]
PACKAGE = DESKTOP / "nexus_desktop"
SCHEMA = PACKAGE / "schema" / "ingest-manifest.v1.schema.json"

# Sensibles a mayúsculas: service_role / SERVICE_ROLE / @Miui; el resto sin distinguir.
CASE_SENSITIVE = ("service_role", "SERVICE_ROLE", "@Miui")
CASE_INSENSITIVE = re.compile(r"hermes|vind|vnd", re.IGNORECASE)


def _package_text_files():
    for path in sorted(PACKAGE.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts or path == SCHEMA:
            continue
        try:
            yield path, path.read_text(encoding="utf-8")
        except UnicodeDecodeError:  # binarios (logo PNG): no son texto del programa
            continue


def test_no_service_role_or_vnd_strings_in_package():
    hits = []
    for path, text in _package_text_files():
        for n, line in enumerate(text.splitlines(), 1):
            if any(s in line for s in CASE_SENSITIVE) or CASE_INSENSITIVE.search(line):
                hits.append(f"{path.relative_to(DESKTOP)}:{n}: {line.strip()}")
    assert hits == []


def test_schema_copy_has_no_forbidden_strings():
    """El esquema se excluye de la búsqueda anterior por ser copia del contrato; aun así se
    comprueba aparte para enterarse si algún día los trae."""
    text = SCHEMA.read_text(encoding="utf-8")
    assert not any(s in text for s in CASE_SENSITIVE)
    assert not CASE_INSENSITIVE.search(text)


def test_entrypoint_imports_without_display():
    """Importar el punto de entrada no abre ventana ni falla (main() solo corre con -m)."""
    env = {k: v for k, v in os.environ.items() if k not in ("DISPLAY",)}
    proc = subprocess.run(
        [sys.executable, "-c",
         "import tkinter, nexus_desktop.__main__ as m; "
         "assert callable(m.main); assert tkinter._default_root is None"],
        cwd=DESKTOP, env=env, capture_output=True, text=True, timeout=120,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout == ""
