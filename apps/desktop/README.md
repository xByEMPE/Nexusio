# NEXUS Importador de palas (app de escritorio)

App de Windows (Python 3.12, Tkinter) para el técnico de campo: importa la carpeta de una
turbina (`WTG …`), marca la punta y la raíz de cada cara de pala, reconstruye las tiras con el
modelo de segmentación (ONNX) y sube fotos, tiras y calibración a la plataforma NEXUS.
Sustituye al importador anterior y al script `scripts/ingest_demo`, ya retirados.

Flujo: inicio de sesión → proyecto y turbina asignados → importar carpeta → longitud de pala →
marcado → procesamiento → resultados → verificación → subida.

## Instalar la app (técnico)

1. Ejecuta `NEXUS-Importador-<versión>-instalador.exe`. Se instala solo para el usuario
   (sin permisos de administrador) en `%LOCALAPPDATA%\Programs\NEXUS Importador` y crea el
   acceso «NEXUS Importador de palas» en el menú Inicio. Se desinstala desde
   *Configuración → Aplicaciones*.
2. Copia el archivo de configuración que te dé el administrador en
   `%APPDATA%\NEXUS\config.json` (ver abajo). Sin él, la pantalla de inicio de sesión dice qué
   falta y dónde ponerlo.

El instalador ya trae exiftool y el modelo de segmentación; no hace falta instalar nada más.

## Configuración

La app solo usa la **llave pública** (publishable) de Supabase. Nunca se pone una llave de
servicio ni secreta: config.py descarta las llaves `sb_secret_…` y los JWT que no sean de rol
`anon`. La contraseña del técnico no se guarda y los tokens no se imprimen.

La URL y la llave se buscan en este orden:

1. Variables de entorno `NEXUS_SUPABASE_URL` y `NEXUS_PUBLISHABLE_KEY` (desarrollo).
2. `%APPDATA%\NEXUS\config.json` (equipo instalado; lo deja el despliegue, no va en el
   instalador ni en el repositorio):

   ```json
   {
     "supabase_url": "https://<proyecto>.supabase.co",
     "supabase_publishable_key": "sb_publishable_…"
   }
   ```

3. Si no hay URL ni llave se usa la de Supabase local, `http://127.0.0.1:54321`, y la pantalla
   de inicio de sesión avisa de que falta la llave. Una llave **sin** URL es un error de
   configuración (no se adivina el servidor), igual que una URL que no empiece por `https://`:
   `http://` solo se admite para un servidor local (`localhost`, `127.0.0.1` o `::1`), porque el
   token viajaría sin cifrar. En ambos casos la pantalla de inicio de sesión dice qué corregir.

Otras variables (opcionales, sobre todo para desarrollo):

| Variable | Uso |
|---|---|
| `NEXUS_EXIFTOOL` | Ruta a `exiftool.exe`. Orden de búsqueda: esta variable → el exiftool incluido con la app (`exiftool\exiftool.exe` en `_internal` o junto al `.exe`) → `exiftool` en el PATH. |
| `NEXUS_MODEL_PATH` | Ruta al modelo `blade_unet_512.onnx`. Si no, se busca en `apps/desktop/models/` y en la carpeta de la app (`models\`). Sin modelo la app avisa y cose sin segmentar. |
| `NEXUS_SAMPLE_WTG` | Carpeta WTG de ejemplo para las pruebas lentas (por defecto la carpeta `WTG 25` junto al repositorio principal; ver `tests/`). |

Datos locales del usuario en `%APPDATA%\NEXUS`: `config.json`, `pending.json` (subidas sin
terminar) y `thumbs\` (caché de miniaturas). Junto a las fotos de la carpeta WTG la app deja
`.ingest_index.json` (ids ya creados y archivos ya subidos), la carpeta
`<WTG>_img_stitched\` con las tiras y `<WTG>_reconstruction.json`.

exiftool: usar la distribución completa de Windows (`exiftool.exe` + carpeta `exiftool_files`,
p. ej. `EXIF\exiftool-13.42_64`). El `exiftool.exe` suelto de `EXIF\` no funciona.

## Desarrollo

```
py -3.12 -m venv apps/desktop/.venv
apps/desktop/.venv/Scripts/python -m pip install -e "apps/desktop[dev]"
apps/desktop/.venv/Scripts/python -m nexus_desktop
```

`requirements.txt` fija las versiones con las que se probó y empaquetó
(`pip install -r apps/desktop/requirements.txt` para reproducirlas).

Para trabajar contra Supabase local: `npx supabase start` en la raíz del repositorio y
`npx supabase status -o env` da `API_URL` y `PUBLISHABLE_KEY`; ponlos en las variables de
entorno o en `config.json`. El usuario técnico de prueba y su proyecto están en
`supabase/seed.sql`.

### Pruebas

```
apps/desktop/.venv/Scripts/python -m pytest apps/desktop/tests -q
apps/desktop/.venv/Scripts/python -m pytest apps/desktop/tests -q -m slow
```

Las pruebas `slow` usan la carpeta WTG de ejemplo, el modelo ONNX y exiftool reales; se omiten
si faltan (define `NEXUS_EXIFTOOL` para las de exiftool). Las pruebas de interfaz usan una sola
ventana Tk por módulo (`tests/conftest.py`).

## Construir el ejecutable

Requisitos que no están en el repositorio:

- El modelo `blade_unet_512.onnx` copiado a mano en `apps/desktop/models/` (se ignora en git).
  La copia del modelo entrenado está en `EXIF\dataset_blades\blade_unet_512.onnx` de la carpeta
  principal de NEXUS.
- La carpeta de exiftool para Windows (`exiftool.exe` + `exiftool_files`).

```
powershell -ExecutionPolicy Bypass -File apps/desktop/packaging/build.ps1 -ExiftoolDir <carpeta de exiftool>
```

(o define `NEXUS_EXIFTOOL_DIR` en lugar de `-ExiftoolDir`). El script comprueba el modelo y
exiftool (y falla con un mensaje claro si falta algo), genera el icono a partir del logo y
llama a PyInstaller con `packaging/nexus_desktop.spec`. Resultado, en carpeta única y sin
consola:

```
apps/desktop/dist/NEXUS-Importador/
  NEXUS-Importador.exe          (icono NEXUS, versión de config.VERSION)
  _internal/
    nexus_desktop/schema/       esquema del manifiesto v1
    nexus_desktop/ui/assets/    logo
    models/blade_unet_512.onnx
    exiftool/exiftool.exe + exiftool_files/
    onnxruntime/, cv2/, …        bibliotecas
```

Pesa unos 300 MB (sobre todo OpenCV, onnxruntime, exiftool y el modelo). `dist/` y `build/`
se ignoran en git.

## Compilar el instalador

Con [Inno Setup 6](https://jrsoftware.org/isinfo.php) y después de `build.ps1`:

```
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" apps\desktop\packaging\installer.iss
```

Genera `apps/desktop/dist/installer/NEXUS-Importador-<versión>-instalador.exe` (la versión se
lee del ejecutable). Instalación por usuario, sin administrador, con acceso en el menú Inicio,
icono de escritorio opcional y desinstalador. **No incluye `config.json` ni ninguna llave**: se
entrega aparte a cada equipo, con la URL y la llave pública de producción.

## Estructura

```
apps/desktop/
  nexus_desktop/
    __main__.py        arranque (python -m nexus_desktop)
    config.py          versión, URL/llave pública, config.json, exiftool y modelo
    domain/            carpeta WTG, EXIF, GSD, medidas, marcado, reconstrucción, posición
    vision/            segmentador U-Net (ONNX) y cosido de tiras
    nexus/             sesión, proyectos y turbinas, TUS, manifiesto v1, orquestador de subida
    storage/           índice local (.ingest_index.json) y subidas pendientes
    ui/                ventana, tema NEXUS y pantallas
    schema/            copia de src/contracts/ingest-manifest.v1.schema.json
  tests/               pytest (rápidas por defecto; -m slow con datos reales)
  packaging/           nexus_desktop.spec, build.ps1, launcher.py, installer.iss
  models/              blade_unet_512.onnx (no versionado)
```

## Contrato con la plataforma

- **Sesión**: Supabase Auth con correo y contraseña del técnico; el token se renueva si vence
  en menos de 5 minutos, antes de cada subida. Si se pierde, la app vuelve al login sin perder
  lo hecho.
- **Proyectos y turbinas**: solo los asignados al técnico (los filtra RLS): `projects`,
  `project_sites`, `assets` y el estado de su `inspections`.
- **Inspección**: si no existe, la app inserta la fila (`kind = wind_blade`,
  `status = captured`); una inspección aprobada no se modifica.
- **Archivos**: TUS reanudable (fragmentos de 6 MB) al bucket `inspection-media`, en
  `{org}/{proyecto}/{inspección}/captures/{id}/…` (original, preview y miniatura) y
  `…/mosaics/{id}/strip.webp` (tiras, lado mayor ≤ 8000 px).
- **Manifiesto**: un manifiesto v1 por pala (`captures[]`, `mosaics[]` con `calibration`),
  validado contra `schema/ingest-manifest.v1.schema.json` antes de enviarlo con la RPC
  `ingest_manifest`, que deja la inspección en revisión (`in_review`). La foto `_ID` va en el
  primero y fija `inspection.id_capture_id`.
- **Posición de la turbina**: de la foto `_ID` (láser `lrf_target` si es válido; si no, GPS del
  dron) en `inspections.asset_lat/asset_lon/asset_position_source`.
- **Idempotencia**: `.ingest_index.json` guarda los ids por `sha256` y lo ya subido; repetir la
  subida no vuelve a subir nada y `ingest_manifest` responde 0 insertados. Una prueba verifica
  que la copia del esquema coincide con `src/contracts/`.
- La versión de la app (`config.VERSION`) va en `manifest.app.version` y en el ejecutable.
