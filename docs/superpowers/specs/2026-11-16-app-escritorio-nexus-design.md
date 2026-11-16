# App de escritorio NEXUS (importador de palas): limpieza y adaptación

Fecha: 2026-11-16 · Estado: borrador para aprobación

## 1. Intención

La app actual (`EXIF/dataset_blades/blade_importer_app.py`, Tkinter, 7 654 líneas) nació para otro cliente (VND/Hermes) y sube a un Supabase antiguo. Hay que dejarla como la **app de escritorio de NEXUS**: la que usa el técnico en su PC para convertir una carpeta de inspección (WTG) en una inspección subida a la plataforma NEXUS.

**El flujo de trabajo del técnico no cambia.** Cambia lo que hay debajo (dónde inicia sesión, qué sube y cómo) y su aspecto.

Flujo, igual que hoy:
1. Iniciar sesión → elegir proyecto y aerogenerador (activo).
2. Importar carpeta WTG (palas A/B/C × LE/TE/PS/SS + foto `_ID`).
3. Marcar punta y raíz por pala.
4. Reconstruir tiras (segmentación U-Net ONNX + costura) y calcular GSD, radio y cuerda desde el EXIF.
5. Verificar resultados.
6. Subir a NEXUS.

Después de esto viene la detección de daños con IA en Hugging Face (fuera de esta spec): la app **solo segmenta**, no detecta daños.

## 2. Objetivos, no objetivos, antiobjetivos

**Objetivos**
- Mismo flujo y mismos resultados de reconstrucción que hoy.
- Subida mediante el contrato de la fase 1 (§8): login con Supabase Auth, UUID generados por la app, subida TUS a `inspection-media`, `ingest_manifest` v1.
- Código modular, sin duplicados ni restos de VND/Hermes.
- Aspecto NEXUS (tema oscuro, paneles de borde fino, acento azul).
- Instalable en Windows.

**No objetivos**
- Detección de daños (Hugging Face, siguiente etapa).
- Pruebas LPS, instrumentos, catálogo de pilotos, apps Android (fuera de alcance permanente).
- Reescribir en otro lenguaje o cambiar de toolkit gráfico.
- Edición de daños o comentarios: eso es del portal.

**Antiobjetivos** (fallaría aunque funcione)
- Una llave de servicio, una contraseña o un secreto dentro de la app o del repo.
- Subir fotos de clientes al repositorio.
- Que repetir la subida duplique datos.

## 3. Restricciones

- Python 3.12, Tkinter/ttk, OpenCV, ONNX Runtime, Pillow, `supabase`, `tuspy`, `pydantic`, `openpyxl`.
- La app contiene solo la URL de Supabase y la llave **pública**. Nada de `service_role`.
- El modelo `blade_unet_512.onnx` (23 MB), `EXIF/`, `WTG*/` y datos de clientes quedan **fuera de git**; el modelo se coloca en una carpeta `models/` ignorada y el instalador lo incluye.
- La subida es **idempotente**: los UUID se guardan en el índice local, y reintentar produce lo mismo (`ingest_manifest` hace upsert por `id`).
- Los archivos subidos usan la ruta `{org}/{project}/{inspection}/…` que exige Storage.

## 4. Enfoques considerados

- **A. Refactorizar en sitio, manteniendo Tkinter (elegido).** Menor riesgo: conserva el flujo ya validado.
- B. Reescribir la interfaz en PySide6/CustomTkinter: mejor aspecto, pero reescribe siete pantallas y arriesga el flujo.
- C. Solo borrar lo muerto y cambiar la subida: rápido, pero deja el monolito de 7 654 líneas.

## 5. Diseño

### 5.1 Ubicación y estructura

`apps/desktop/` en el repo NEXUS:

```
apps/desktop/
  pyproject.toml / requirements.txt
  nexus_desktop/
    __main__.py              # arranque
    config.py                # URL pública, versión, rutas de datos
    theme.py                 # tokens NEXUS → ttk
    ui/                      # pantallas: login, inicio, importación, marcado,
                             #   procesamiento, resultados, verificación, subida
    domain/
      wtg_folder.py          # validación de estructura y detección de _ID
      exif.py                # lectura EXIF/XMP DJI (GPS, gimbal, LRF)
      measurement.py         # GSD, radio, cuerda
    vision/
      segmenter.py           # U-Net ONNX
      stitcher.py            # costura de tiras
    nexus/
      auth.py                # login/refresh con Supabase Auth
      projects.py            # proyectos y activos asignados
      uploader.py            # TUS a Storage
      manifest.py            # manifiesto v1 (modelos pydantic)
    storage/
      local_index.py         # índice local de inspecciones y UUID
  tests/
  packaging/                 # PyInstaller + instalador
```

### 5.2 Qué se elimina

- Todo Hermes: `hermes/`, `hermes_config.json`, `_process_hermes_upload`, `_validate_hermes_distance`, `_extract_turbine_telemetry`, los campos `is_hermes` y `sgre_id`.
- El Supabase antiguo: `AuthService._get_user_projects` (esquema viejo), `SupabaseStorageService`, `upload_reconstruction`, el caché de proyectos, `load_supabase_config_from_json`, `service_role_key` y los buckets antiguos.
- `_upload_selected_turbines` (~1 700 líneas) y `_show_upload_summary`: se sustituyen por `nexus/uploader.py` y una pantalla de subida nueva.
- Marca VND: título "VIND GROUP - Blade Importer", logos, textos, iconos.
- Archivos: `blade_importer_app copy.py`, `blade_reconstruction_app_v2/v3`, `blade_reconstruction_gui`, `chord_debugger`, `debug_*`, `test_wtg_detection`, `to_mask`, logs, `__pycache__`, `debug_output*`, `VND_LocalData`, `125_inspection_data.xlsx`, `sql_schema.txt`, `hermes_lines*.txt`, `guia_unet_segmentacion_codigo.pdf`, `build/`, `dist/`.
- Entrenamiento (`train_unet_blade.py`, `export_unet_to_onnx.py`, `.pt`): sale del repo; se conserva aparte si se reentrena.
- Dependencias de PyTorch y entrenamiento en `requirements.txt` (la app solo necesita ONNX Runtime).

### 5.3 Qué se conserva (lógica, no el código tal cual)

Validación de carpeta WTG (reconocimiento START/INTERVAL/END y estructura A/B/C/LE/TE/PS/SS), lectura de EXIF, `BladeMeasurementLogic`, segmentación y costura de `blade_reconstruction_test.py`, marcado de punta y raíz, índice local. Cada pieza se mueve a su módulo con pruebas que fijan el resultado actual (mismos números para la carpeta de ejemplo) antes de cambiar nada.

### 5.4 Correspondencia con el contrato v1

| App actual | Manifiesto v1 |
|---|---|
| Foto del dron, EXIF, GPS, gimbal, LRF | `captures[]` (con `sha256`, `paths`, `gps`, `gimbal`, `gsd`) |
| Foto `_ID` | `inspection.id_capture_id` |
| Pala y cara, radio, dirección de secuencia, cuerda | `captures[].blade` |
| Tiras reconstruidas + punta/raíz/longitud | `mosaics[]` + `calibration` |
| Posición de la turbina (láser o GPS de `_ID`) | columnas `asset_lat/lon/source` de `inspections` |
| Térmicas | `captures[].thermal` (matriz 16 bits PNG) |
| Daños | no se suben desde la app en esta etapa |

Se genera un manifiesto por pala (el contrato es acumulativo). Antes de subir, la app valida el manifiesto con pydantic contra el mismo esquema que usa el portal (`ingest-manifest.v1.schema.json`).

### 5.5 Subida

1. Login (correo y contraseña) → sesión con refresh.
2. Proyectos y activos asignados (RLS ya filtra).
3. Si la inspección es nueva, la app inserta su fila (`status='captured'`).
4. Sube archivos con TUS (fragmentos de 6 MB, reanudable) a `inspection-media/{org}/{project}/{inspection}/…`; originales, previews, miniaturas, matrices térmicas y tiras.
5. Llama `ingest_manifest`; muestra insertados, actualizados y omitidos. Errores `manifest_invalid` se muestran con ruta y código.
6. Reintentar es seguro.

### 5.6 Estilo

`theme.py` define los tokens de `globals.css` (fondo `#000`, capas `#07090c`/`#101114`, borde `#262626`, acento `#3d87fb`, crítico, precaución, texto) y los aplica con un tema ttk único (botones, entradas, tablas, paneles, barras de progreso). El logo es el de NEXUS. Un solo idioma: español.

### 5.7 Empaquetado

PyInstaller a un instalable de Windows; incluye el modelo ONNX, `exiftool` y el logo. Versión semántica en `config.py`, que también se envía en `manifest.app.version`.

### 5.8 Pruebas

Pruebas unitarias del dominio (carpeta de ejemplo, GSD, radio, cuerda), del manifiesto (esquema) y del cliente de subida con Supabase local. El flujo completo se prueba contra `supabase start` con la carpeta WTG de ejemplo, sin datos reales de clientes en el repo.

## 6. Orden de trabajo

1. Respaldar el estado actual y copiar la app a `apps/desktop/` (sin datos).
2. Pruebas de caracterización de la lógica existente.
3. Dividir el monolito en módulos y borrar lo muerto.
4. Capa `nexus/` (login, proyectos, TUS, manifiesto) y pantalla de subida.
5. Tema NEXUS en todas las pantallas.
6. Empaquetado e instalador.

## 7. Queda a criterio de quien lo construye

Nombres exactos de módulos, biblioteca de TUS concreta, detalle de la pantalla de subida, y cómo se reutiliza `blade_reconstruction_test.py` (el algoritmo de costura se conserva como está).
