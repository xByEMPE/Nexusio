# NEXUS Importador de palas (app de escritorio)

App de Windows (Python 3.12, Tkinter) para el técnico de campo: importa la carpeta de una
turbina (`WTG …`), marca la punta y la raíz de cada cara de pala, reconstruye las tiras con el
modelo de segmentación (ONNX) y sube fotos, tiras y calibración a la plataforma NEXUS.
Sustituye al importador anterior y al script `scripts/ingest_demo`, ya retirados.

Flujo (sin conexión hasta subir): Inicio → importar carpeta (nombre de la turbina y longitud de
pala) → marcado → procesamiento → resultados → verificación → «¿Subir ahora o guardar para
después?». Solo al subir se pide iniciar sesión y elegir proyecto y turbina (pantalla «Destino de
la subida»); el técnico puede procesar varias carpetas en el campo y subirlas más tarde.

## Instalar la app (técnico)

1. Ejecuta `NEXUS-Importador-<versión>-instalador.exe`. Se instala solo para el usuario
   (sin permisos de administrador) en `%LOCALAPPDATA%\Programs\NEXUS Importador` y crea el
   acceso «NEXUS Importador de palas» en el menú Inicio. Se desinstala desde
   *Configuración → Aplicaciones*.
2. Si el instalador se compiló con la URL y la llave pública (ver «Compilar el instalador»),
   ya deja `%APPDATA%\NEXUS\config.json`. Si no, copia ahí el archivo de configuración que te dé el
   administrador (ver abajo). Sin él, la pantalla de inicio de sesión dice qué falta y dónde
   ponerlo.

El instalador ya trae exiftool y el modelo de segmentación; no hace falta instalar nada más.

## Configuración

La app solo usa la **llave pública** (publishable) de Supabase. Nunca se pone una llave de
servicio ni secreta: config.py descarta las llaves `sb_secret_…` y los JWT que no sean de rol
`anon`. La contraseña del técnico no se guarda y los tokens no se imprimen.

La URL y la llave se buscan en este orden:

1. Variables de entorno `NEXUS_SUPABASE_URL` y `NEXUS_PUBLISHABLE_KEY` (desarrollo).
2. `%APPDATA%\NEXUS\config.json` (equipo instalado; lo crea el instalador si se compiló con
   la URL y la llave públicas, o se copia a mano; nunca va en el repositorio):

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

Datos locales del usuario en `%APPDATA%\NEXUS`: `config.json`, `pending.json` (inspecciones
«Listas para subir» y subidas sin terminar; solo rutas, nombres y estado), `thumbs\` (caché de miniaturas; se recorta sola a 500 MB) y `logs\nexus-desktop.log` (registro rotativo,
5 copias de 2 MB, sin tokens, llaves ni contraseñas: es lo que se envía a soporte si algo
falla). Junto a las fotos de la carpeta WTG la app deja
`.ingest_index.json` (ids ya creados y archivos ya subidos), la carpeta
`<WTG>_img_stitched\` con las tiras, `<WTG>_reconstruction.json` y, al terminar el procesado,
`<WTG>_inspeccion_lista.json` (versión 2; se sigue leyendo la 1: nombre de la turbina, longitud de pala y, por sección,
cara, pala, tira, tamaño, calibración en píxeles de la tira original y fotos con radio, GSD y su origen);
todas las rutas son relativas a la carpeta WTG, así que sobrevive a moverla). Con él «Subir» en
el Inicio reconstruye la subida aunque se haya cerrado la app; se valida al cargar y, si falta una
foto o una tira o está dañado, la app lo dice en español sin borrar nada.

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
icono de escritorio opcional y desinstalador.

### Que el instalador cree `config.json`

`build.ps1` acepta `-SupabaseUrl` y `-PublishableKey` (o las variables de entorno
`NEXUS_SUPABASE_URL` y `NEXUS_PUBLISHABLE_KEY`). Los valida antes de compilar con las mismas
reglas que `config.py` (llave `sb_secret_…` o JWT que no sea de rol `anon`, URL que no sea
`https://` salvo `http://` a `localhost`/`127.0.0.1`/`[::1]` y valores vacíos son un error) y deja
`apps/desktop/build/config.json` (UTF-8 sin BOM, solo esas dos claves; se rechazan llaves con espacios y URLs con usuario:clave@; `build/` está ignorada en
git). `installer.iss` lo empaqueta si existe y lo instala en `%APPDATA%\NEXUS\config.json`.

Forma preferida (variables de entorno: la llave no queda en el historial de PowerShell; es
pública, pero es mejor práctica):

```
$env:NEXUS_SUPABASE_URL = "<URL>"
$env:NEXUS_PUBLISHABLE_KEY = "<llave pública>"
powershell -ExecutionPolicy Bypass -File apps/desktop/packaging/build.ps1 -ExiftoolDir <carpeta de exiftool>
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" apps\desktop\packaging\installer.iss
```

Alternativa con parámetros: `... build.ps1 -ExiftoolDir <carpeta> -SupabaseUrl <URL> -PublishableKey <llave pública>`.

- **La llave es pública** (la que ya viaja en cualquier cliente web; los permisos los
  imponen las políticas RLS), pero aun así nunca se escribe en el repositorio ni se imprime
  completa en la consola del script. Se obtiene en el panel de Supabase → *Project Settings* →
  *API Keys* → «Publishable key». No uses nunca la «Secret key» ni la `service_role`.
- Sin esos parámetros, `build.ps1` no falla: avisa de que el instalable **no creará
  `config.json`** y habrá que crearlo a mano o recompilar con ellos.
- Si el equipo ya tiene un `config.json` (por ejemplo apuntando a otro proyecto), la
  instalación **no lo cambia** (`onlyifdoesntexist`) y desinstalar tampoco lo borra
  (`uninsneveruninstall`). Para forzar el nuevo, borra `%APPDATA%\NEXUS\config.json` y reinstala, o
  edítalo a mano. El instalador sigue sin pedir administrador y no toca nada más de
  `%APPDATA%\NEXUS`.
- `build.ps1 -ValidateOnly -OutDir <carpeta> …` solo valida y escribe `config.json`, sin compilar.

## Estructura

```
apps/desktop/
  nexus_desktop/
    __main__.py        arranque (python -m nexus_desktop)
    config.py          versión, URL/llave pública, config.json, exiftool y modelo
    domain/            carpeta WTG, EXIF, GSD, medidas, marcado, reconstrucción, posición
    vision/            segmentador U-Net (ONNX) y cosido de tiras
    nexus/             sesión, proyectos y turbinas, TUS, manifiesto v1, orquestador de subida
    storage/           índice local (.ingest_index.json), subidas pendientes e inspección lista (ready.py)
    ui/                ventana, tema NEXUS, etiquetas compartidas (labels.py) y pantallas
    schema/            copia de src/contracts/ingest-manifest.v1.schema.json
  tests/               pytest (rápidas por defecto; -m slow con datos reales)
  packaging/           nexus_desktop.spec, build.ps1, launcher.py, installer.iss
  models/              blade_unet_512.onnx (no versionado)
```

## Contrato con la plataforma

- **Sesión**: Supabase Auth con correo y contraseña del técnico, solo al subir (la app abre en
  el Inicio sin sesión: «Sin conexión»); el token se renueva si vence en menos de 5 minutos,
  antes de cada subida. Si se pierde durante la subida, la app vuelve al login y después a la
  subida sin perder lo hecho.
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
  subida no vuelve a subir nada y `ingest_manifest` responde 0 insertados. Una tira reprocesada
  (mismo nombre, otro contenido) sí se reenvía: el índice guarda la huella de cada tira subida.
  Los ids del índice deben ser UUID; si no, el índice se respalda y se empieza uno nuevo. Una
  prueba verifica que la copia del esquema coincide con `src/contracts/`.
- La versión de la app (`config.VERSION`) va en `manifest.app.version` y en el ejecutable.

## Límites conocidos

- **GSD (mm/px) de cada foto: medido o estimado.** El GSD sale de la distancia del láser del dron
  (`LRFTargetDistance`). En una inspección típica (WTG 25: 212 fotos) el láser no encuentra blanco
  (`LRFStatus=TooFar`, distancia 0) en cerca de una de cada cuatro fotos, sobre todo en la punta de
  la pala (a más de 30 m de la raíz) y en las caras de canto (LE/TE), y a veces mide el fondo
  (456 m) en vez de la pala; ese GSD se descarta por estar fuera de 0,01–100 mm/px. Como la cámara
  apunta de frente (gimbal ≈ 0°), la altura de vuelo tampoco sirve de respaldo. Sin GSD la foto no
  tendría escala ni mediciones en el visor. Por eso `domain/gsd_fill.py` estima el GSD de esas fotos
  (nunca toca uno medido): en el **interior** de la cara (hay fotos medidas a ambos lados) interpola
  por altitud entre las dos vecinas más cercanas (error medio 3,5 % con 1 foto oculta, 4,4 % con 3 y
  4,4 % con 5 seguidas, máximos de 23-28 %: lo mide la prueba lenta
  `test_wtg25_real_exif_fill_matches_the_investigation` ocultando fotos reales de WTG 25); en el
  **extremo** (típicamente la punta, sin vecina por un lado) promedia el GSD de la vecina más
  cercana con el que implica la escala de la tira (calibración punta/raíz); su error (≈ 8,7 % medio,
  41 % máx.) es una **medición puntual de la investigación**, no la cubre ninguna prueba. Si no hay vecinas ni tira queda sin GSD.
  No se usa una vecina a más de 10 fotos ni 30 m de altitud, ni un GSD medido que difiera más de 3×
  de la mediana de la cara. Lo estimado se sube con `gsd.source = "mosaic_calibration"` y
  `confidence = "low"`; en el portal el visor lo muestra como «escala estimada». En la
  verificación se ve como «≈1,12» (medido: «1,12»; sin escala: «—») y cada sección indica cuántas
  fotos tienen escala estimada o ninguna. Las mediciones sobre una foto estimada son aproximadas.
- **Paso entre fotos al coser sin láser.** El cosedor usa 4,5 m de distancia por defecto cuando la
  foto no tiene láser; en la punta eso da un error medio de −9,4 % en el paso entre fotos (medición puntual de la investigación). No se ha
  cambiado (mejora posible aparte: usar el GSD estimado).

- **Palas con la punta arriba.** La reconstrucción, los radios y la calibración suponen que la
  punta está más alta que la raíz. Si las marcas dicen lo contrario (la foto de la punta está más
  baja que la de la raíz) la app muestra un aviso en Resultados, pero no corrige nada: una pala
  apuntando hacia abajo da radios invertidos. Soportarlas queda pendiente de una decisión de
  producto.
- **Las marcas no se guardan.** La punta y la raíz marcadas viven solo en memoria: si la app se
  cierra antes de procesar, hay que volver a marcar. Lo ya subido sí se conserva (índice local) y
  la subida se reanuda sin duplicar.
- **La app escribe dentro de la carpeta WTG**: `<WTG>_img_stitched\` (las tiras),
  `<WTG>_reconstruction.json` (radios, GSD, calibración y cuerda), `<WTG>_inspeccion_lista.json`
  (lo necesario para subir más tarde) y `.ingest_index.json`. Nunca
  borra fotos; reprocesar sobrescribe las tiras y el JSON.
