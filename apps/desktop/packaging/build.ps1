<#
.SYNOPSIS
  Construye NEXUS Importador de palas con PyInstaller:
  apps/desktop/dist/NEXUS-Importador/NEXUS-Importador.exe (carpeta única, sin consola).

.DESCRIPTION
  Antes de compilar comprueba lo que no está en el repositorio:
  - el modelo apps/desktop/models/blade_unet_512.onnx (se copia a mano);
  - la carpeta de exiftool para Windows (exiftool.exe + exiftool_files), indicada con
    -ExiftoolDir o con la variable de entorno NEXUS_EXIFTOOL_DIR.
  La URL de Supabase y la llave PÚBLICA (publishable; nunca la secreta ni la de servicio) se
  indican con -SupabaseUrl y -PublishableKey (o con las variables de entorno NEXUS_SUPABASE_URL
  y NEXUS_PUBLISHABLE_KEY). Se validan con las mismas reglas que nexus_desktop/config.py antes
  de compilar y se escriben en apps/desktop/build/config.json, que el instalador
  (installer.iss) deja en %APPDATA%\NEXUS\config.json del equipo donde se instala. Sin ellas el
  script no falla: avisa de que el instalable no creará config.json. La llave nunca se imprime
  completa. -ValidateOnly solo valida y escribe config.json en -OutDir (sin compilar nada).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps/desktop/packaging/build.ps1 -ExiftoolDir C:\ruta\exiftool-13.42_64
#>
param(
    [string]$ExiftoolDir = $env:NEXUS_EXIFTOOL_DIR,
    [string]$Python = "",
    [string]$SupabaseUrl = $env:NEXUS_SUPABASE_URL,
    [string]$PublishableKey = $env:NEXUS_PUBLISHABLE_KEY,
    [switch]$ValidateOnly,
    [string]$OutDir = ""
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

function Test-PublicKey([string]$Key) {
    # Misma regla que config._is_public_key: ni sb_secret_ ni un JWT cuyo rol no sea anon.
    if ($Key.StartsWith("sb_secret_")) { return $false }
    $parts = $Key.Split(".")
    if ($parts.Count -eq 3 -and $Key.StartsWith("eyJ")) {
        try {
            $b = $parts[1].Replace("-", "+").Replace("_", "/")
            $b = $b.PadRight($b.Length + ((4 - $b.Length % 4) % 4), "=")
            $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b))
            $payload = $json | ConvertFrom-Json
            return ($payload.role -eq "anon")
        } catch { return $false }
    }
    return $true
}

function Test-SafeUrl([string]$Url) {
    # Misma regla que config._is_safe_url: https://<servidor>, o http:// solo a un servidor local.
    $uri = $null
    if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri)) { return $false }
    $hostName = $uri.Host.ToLowerInvariant()
    # .NET expande IPv6 (0000:…:0001); config.py solo reconoce la forma literal [::1].
    if ($uri.HostNameType -eq [System.UriHostNameType]::IPv6) {
        $hostName = if ($Url -match "^[A-Za-z][A-Za-z0-9+.-]*://[^/?#]*\[::1\]") { "::1" } else { "ipv6" }
    }
    if (-not $hostName) { return $false }
    if ($uri.Scheme -eq "https") { return $true }
    return ($uri.Scheme -eq "http" -and @("localhost", "127.0.0.1", "::1") -contains $hostName)
}

function Mask-Key([string]$Key) {
    if ($Key.Length -le 12) { return "…" }
    return $Key.Substring(0, 12) + "…"
}

# --- Configuración pública para el instalador (se valida antes de compilar) ---------------
$ConfigJson = $null
if (-not $SupabaseUrl -and -not $PublishableKey) {
    Write-Host ("AVISO: no se indicó -SupabaseUrl ni -PublishableKey (ni NEXUS_SUPABASE_URL / NEXUS_PUBLISHABLE_KEY): " +
                "el instalable no creará config.json. Habrá que crearlo a mano en %APPDATA%\NEXUS\config.json " +
                "o recompilar con esos parámetros.") -ForegroundColor Yellow
} else {
    if (-not $SupabaseUrl -or -not $PublishableKey) {
        Fail "Indica la URL y la llave pública juntas (-SupabaseUrl y -PublishableKey): falta una de las dos."
    }
    $SupabaseUrl = $SupabaseUrl.Trim()
    $PublishableKey = $PublishableKey.Trim()
    if (-not (Test-SafeUrl $SupabaseUrl)) {
        Fail ("La URL de Supabase no es válida: debe ser https://<servidor> (http:// solo para localhost, " +
              "127.0.0.1 o [::1]). Recibido: $SupabaseUrl")
    }
    if (-not (Test-PublicKey $PublishableKey)) {
        Fail ("La llave indicada (" + (Mask-Key $PublishableKey) + ") no es una llave pública: se rechazan " +
              "las llaves sb_secret_… y los JWT cuyo rol no sea anon. Usa la «Publishable key» del panel de Supabase.")
    }
    $ConfigJson = ([ordered]@{ supabase_url = $SupabaseUrl; supabase_publishable_key = $PublishableKey } |
                   ConvertTo-Json)
    Write-Host ("Configuración pública: {0}, llave {1}" -f $SupabaseUrl, (Mask-Key $PublishableKey))
}

function Write-ConfigJson([string]$Dir) {
    if ($null -eq $ConfigJson) { return }
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    $target = Join-Path (Resolve-Path -LiteralPath $Dir).Path "config.json"
    [System.IO.File]::WriteAllText($target, $ConfigJson + "`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "config.json: $target"
}

if ($ValidateOnly) {
    if (-not $OutDir) { Fail "-ValidateOnly necesita -OutDir <carpeta> donde escribir config.json." }
    Write-ConfigJson $OutDir
    exit 0
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

# config.json va después de PyInstaller porque --clean vacía la carpeta de trabajo (build).
$ConfigOut = Join-Path $WorkPath "config.json"
if (Test-Path -LiteralPath $ConfigOut) { Remove-Item -LiteralPath $ConfigOut -Force }  # nunca uno de otra compilación
Write-ConfigJson $WorkPath

$Folder = Split-Path -Parent $Exe
$Bytes = (Get-ChildItem -LiteralPath $Folder -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host ("Listo: {0} (carpeta de {1:N0} MB)" -f $Exe, ($Bytes / 1MB)) -ForegroundColor Green
