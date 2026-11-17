# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller: NEXUS Importador de palas en carpeta única y sin consola.

No se ejecuta a mano: lo llama build.ps1, que comprueba antes el modelo y exiftool y pasa la
carpeta de exiftool en NEXUS_EXIFTOOL_DIR. Resultado: dist/NEXUS-Importador/NEXUS-Importador.exe
con todo lo empaquetado en dist/NEXUS-Importador/_internal (sys._MEIPASS):
  nexus_desktop/schema/*.json      esquema del manifiesto v1
  nexus_desktop/ui/assets/*.png    logo NEXUS
  models/blade_unet_512.onnx       modelo de segmentación (config.model_search_paths)
  exiftool/exiftool.exe (+ exiftool_files/)   (config.resolve_exiftool)
"""
import os
import re
from pathlib import Path

from PIL import Image
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs
from PyInstaller.utils.win32 import versioninfo as vi

APP_NAME = "NEXUS-Importador"
PRODUCT = "NEXUS Importador de palas"

PACKAGING = Path(SPECPATH).resolve()
DESKTOP = PACKAGING.parent
PACKAGE = DESKTOP / "nexus_desktop"
WORK = Path(workpath).resolve()  # apps/desktop/build/<spec> (lo fija build.ps1)


def fail(message):
    raise SystemExit(f"ERROR: {message}")


# --- Entradas comprobadas -------------------------------------------------------------------
version_match = re.search(r'^VERSION\s*=\s*"([^"]+)"', (PACKAGE / "config.py").read_text("utf-8"), re.M)
if not version_match:
    fail("no se encontró VERSION en nexus_desktop/config.py")
VERSION = version_match.group(1)

MODEL = DESKTOP / "models" / "blade_unet_512.onnx"
if not MODEL.is_file():
    fail(f"falta el modelo {MODEL} (ver build.ps1)")

EXIFTOOL_DIR = Path(os.environ.get("NEXUS_EXIFTOOL_DIR", ""))
if not (str(EXIFTOOL_DIR) and (EXIFTOOL_DIR / "exiftool.exe").is_file()
        and (EXIFTOOL_DIR / "exiftool_files").is_dir()):
    fail("NEXUS_EXIFTOOL_DIR debe ser la carpeta de exiftool para Windows "
         "(exiftool.exe + exiftool_files)")

# --- Icono (.ico a partir del logo PNG) e información de versión ---------------------------
WORK.mkdir(parents=True, exist_ok=True)
ICON = WORK / "nexus-icon.ico"
Image.open(PACKAGE / "ui" / "assets" / "nexus-logo.png").save(
    ICON, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (192, 192)])

numbers = tuple(int(n) for n in (re.findall(r"\d+", VERSION) + ["0"] * 4)[:4])
VERSION_INFO = vi.VSVersionInfo(
    ffi=vi.FixedFileInfo(filevers=numbers, prodvers=numbers),
    kids=[
        vi.StringFileInfo([vi.StringTable("040A04B0", [  # español, Unicode
            vi.StringStruct("CompanyName", "NEXUS"),
            vi.StringStruct("FileDescription", PRODUCT),
            vi.StringStruct("FileVersion", VERSION),
            vi.StringStruct("InternalName", APP_NAME),
            vi.StringStruct("OriginalFilename", f"{APP_NAME}.exe"),
            vi.StringStruct("ProductName", PRODUCT),
            vi.StringStruct("ProductVersion", VERSION),
        ])]),
        vi.VarFileInfo([vi.VarStruct("Translation", [0x040A, 1200])]),
    ],
)

# --- Análisis ---------------------------------------------------------------------------------
datas = [
    (str(PACKAGE / "schema" / "ingest-manifest.v1.schema.json"), "nexus_desktop/schema"),
    (str(PACKAGE / "ui" / "assets" / "nexus-logo.png"), "nexus_desktop/ui/assets"),
    (str(MODEL), "models"),
    (str(EXIFTOOL_DIR / "exiftool.exe"), "exiftool"),
    (str(EXIFTOOL_DIR / "exiftool_files"), "exiftool/exiftool_files"),
]
datas += collect_data_files("onnxruntime")

a = Analysis(
    [str(PACKAGING / "launcher.py")],
    pathex=[str(DESKTOP)],
    binaries=collect_dynamic_libs("onnxruntime"),
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=["pytest", "onnx", "matplotlib", "IPython", "torch"],
    noarchive=False,
)


EXIFTOOL_DLLS = {p.name.lower() for p in (EXIFTOOL_DIR / "exiftool_files").glob("*.dll")}


def _from_exiftool_outside_its_folder(entry):
    """PyInstaller analiza exiftool.exe (va como dato) y copiaría sus DLL (perl532.dll,
    libstdc++… o la libgcc que encuentre en el PATH) también a la raíz de _internal; exiftool usa
    las de exiftool/exiftool_files y nada más de la app las necesita."""
    dest, src = entry[0].replace("\\", "/"), Path(entry[1]).resolve()
    if dest.startswith("exiftool/"):
        return False
    return EXIFTOOL_DIR.resolve() in src.parents or ("/" not in dest and dest.lower() in EXIFTOOL_DLLS)


a.binaries = [b for b in a.binaries if not _from_exiftool_outside_its_folder(b)]
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=APP_NAME,
    console=False,
    icon=str(ICON),
    version=VERSION_INFO,
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name=APP_NAME)
