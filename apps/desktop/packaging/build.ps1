<#
.SYNOPSIS
  Construye NEXUS Importador de palas con PyInstaller:
  apps/desktop/dist/NEXUS-Importador/NEXUS-Importador.exe (carpeta única, sin consola).

.DESCRIPTION
  Antes de compilar comprueba lo que no está en el repositorio:
  - el modelo apps/desktop/models/blade_unet_512.onnx (se copia a mano);
  - la carpeta de exiftool para Windows (exiftool.exe + exiftool_files), indicada con
    -ExiftoolDir o con la variable de entorno NEXUS_EXIFTOOL_DIR.
  No incluye ninguna llave: la URL y la llave pública van en %APPDATA%\NEXUS\config.json
  del equipo donde se instala.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps/desktop/packaging/build.ps1 -ExiftoolDir C:\ruta\exiftool-13.42_64
#>
param(
    [string]$ExiftoolDir = $env:NEXUS_EXIFTOOL_DIR,
    [string]$Python = ""
)

# "Continue": en Windows PowerShell 5.1, con "Stop", lo que un programa externo escribe en
# stderr (PyInstaller escribe ahí su registro) se vuelve error y corta el script. Cada paso
# comprueba $LASTEXITCODE o el archivo esperado.
$ErrorActionPreference = "Continue"

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

$Packaging = $PSScriptRoot
$Desktop = Split-Path -Parent $Packaging
$Model = Join-Path $Desktop "models\blade_unet_512.onnx"
$Spec = Join-Path $Packaging "nexus_desktop.spec"
$DistPath = Join-Path $Desktop "dist"
$WorkPath = Join-Path $Desktop "build"
$Exe = Join-Path $DistPath "NEXUS-Importador\NEXUS-Importador.exe"

# --- Python con PyInstaller ---------------------------------------------------------------
if (-not $Python) { $Python = Join-Path $Desktop ".venv\Scripts\python.exe" }
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    Fail ("No se encontró Python en $Python. Crea el entorno: py -3.12 -m venv apps/desktop/.venv " +
          "y apps/desktop/.venv/Scripts/python -m pip install -e `"apps/desktop[dev]`" (o indica -Python).")
}
& $Python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Fail "Falta PyInstaller en ese Python. Instálalo con: $Python -m pip install -e `"apps/desktop[dev]`""
}

# --- Modelo ONNX (no está en git) ---------------------------------------------------------
if (-not (Test-Path -LiteralPath $Model -PathType Leaf)) {
    Fail ("Falta el modelo de segmentación: $Model`n" +
          "  No está en el repositorio (models/*.onnx se ignora). Cópialo a mano desde la copia del " +
          "modelo entrenado, EXIF\dataset_blades\blade_unet_512.onnx en la carpeta principal de NEXUS, " +
          "a apps\desktop\models\ y vuelve a ejecutar este script.")
}

# --- exiftool para Windows ----------------------------------------------------------------
if (-not $ExiftoolDir) {
    Fail ("No se indicó la carpeta de exiftool. Usa -ExiftoolDir <carpeta> o la variable de entorno " +
          "NEXUS_EXIFTOOL_DIR. Debe ser la distribución de Windows completa (exiftool.exe y la carpeta " +
          "exiftool_files), por ejemplo EXIF\exiftool-13.42_64; el exiftool.exe suelto no sirve.")
}
$ExiftoolExe = Join-Path $ExiftoolDir "exiftool.exe"
if (-not (Test-Path -LiteralPath $ExiftoolExe -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $ExiftoolDir "exiftool_files") -PathType Container)) {
    Fail ("La carpeta de exiftool no es válida: $ExiftoolDir`n" +
          "  Debe contener exiftool.exe y la carpeta exiftool_files (distribución de Windows de exiftool).")
}
$ExiftoolVersion = (& $ExiftoolExe -ver 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $ExiftoolVersion) {
    Fail "exiftool no funciona en $ExiftoolExe (exiftool -ver falló). Usa una copia completa de exiftool."
}

Write-Host "Modelo:   $Model"
Write-Host "exiftool: $ExiftoolExe (versión $ExiftoolVersion)"
Write-Host "Salida:   $DistPath\NEXUS-Importador"
Write-Host ""

# --- PyInstaller --------------------------------------------------------------------------
$env:NEXUS_EXIFTOOL_DIR = (Resolve-Path -LiteralPath $ExiftoolDir).Path
& $Python -m PyInstaller --noconfirm --clean --distpath $DistPath --workpath $WorkPath $Spec
if ($LASTEXITCODE -ne 0) { Fail "PyInstaller terminó con errores (código $LASTEXITCODE)." }
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { Fail "No se generó $Exe." }

$Folder = Split-Path -Parent $Exe
$Bytes = (Get-ChildItem -LiteralPath $Folder -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host ("Listo: {0} (carpeta de {1:N0} MB)" -f $Exe, ($Bytes / 1MB)) -ForegroundColor Green
