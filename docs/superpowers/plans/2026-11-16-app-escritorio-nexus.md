# App de escritorio NEXUS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `EXIF/dataset_blades/blade_importer_app.py` en la app de escritorio NEXUS (`apps/desktop/`): mismo flujo del técnico, subida por el contrato v1 y estilo NEXUS.

**Architecture:** Paquete Python modular (`domain/`, `vision/`, `nexus/`, `storage/`, `ui/`). La capa `nexus/` **no se escribe de cero**: se promueve `scripts/ingest_demo` (ya implementa EXIF, GSD, derivados WebP, TUS, manifiesto v1, tiras, posición `_ID` e índice idempotente, con pruebas). La lógica de reconstrucción se extrae del monolito con pruebas de caracterización antes de moverla. La interfaz se reescribe pantalla a pantalla sobre Tkinter/ttk con un tema único.

**Tech Stack:** Python 3.12, Tkinter/ttk, OpenCV, NumPy, ONNX Runtime, Pillow, supabase-py, tuspy, jsonschema, pytest, PyInstaller (sin openpyxl: el Excel del original se sustituye por `{wtg}_reconstruction.json`).

**Spec:** `docs/superpowers/specs/2026-11-16-app-escritorio-nexus-design.md` (contrato de subida: `docs/superpowers/specs/2026-11-11-inspecciones-fase1-base-design.md` §8; esquema: `src/contracts/ingest-manifest.v1.schema.json`).

## Global Constraints

- Python **3.12**, interfaz **solo en español**, instalable de **Windows** (PyInstaller).
- La app contiene solo la URL de Supabase y la llave **pública**. Nunca `service_role`, contraseñas ni secretos en código, config o repo.
- Fuera de git: `EXIF/`, `WTG*/`, `apps/desktop/models/*.onnx`, datos de clientes, `.ingest_index.json`.
- Subida: TUS (fragmentos de 6 MB) a `inspection-media/{org}/{project}/{inspection}/…`; luego `ingest_manifest` v1; los UUID los genera la app y se guardan en el índice local; reintentar es idempotente.
- Un manifiesto por pala (el contrato es acumulativo). `manifest.app.name = "nexus-desktop"`.
- La app **no** sube daños ni los detecta (Hugging Face es la etapa siguiente).
- Memoria del usuario: **ningún commit ni push sin su confirmación**. Los pasos "Commit" de este plan significan: proponer el commit y esperar el sí. Nada sube a GitHub sin pedirlo.
- La carpeta `EXIF/dataset_blades/` no se borra ni se modifica: queda como referencia hasta que el usuario lo decida.
- Tokens de estilo (de `src/app/globals.css`, tema oscuro): fondo `#000000`, capa `#07090c`, elevado `#101114`, borde `#262626`, borde fuerte `#3b3b3b`, acento `#3d87fb`, acento botón `#1a73e8`, acento profundo `#001a40`, telemetría `#85b4ff`, crítico `#ff5c4d`, precaución `#e8b64d`, texto `#ffffff`, tenue `#a8a8a8`, sutil `#878787`.

## Review Focus

- Carpeta con solo algunas palas o caras (p. ej. solo la pala A, sin TE): el importador debe avisar qué falta, no fallar.
- Rutas con espacios, acentos o `ñ` (p. ej. `WTG 25`, `Año 2026`): importación, EXIF (exiftool) y subida deben funcionar.
- Foto sin GPS, sin láser, corrupta o no JPEG dentro de una cara: se omite con aviso y el resto continúa.
- Sesión que vence o se pierde la red a mitad de subida: se renueva el token o se detiene sin duplicar; al reintentar no se re-suben objetos ya subidos con el mismo `sha256`.
- Técnico sin proyectos asignados, o con el activo ya `approved`: mensaje claro, sin traza de error.
- Tiras panorámicas muy grandes (> 8 000 px de lado): se reducen solo al subir; la calibración (filas de punta y raíz) se expresa en el tamaño **subido**.

---

### Task 1: Esqueleto de `apps/desktop` y promoción de `ingest_demo`

**Files:**
- Create: `apps/desktop/pyproject.toml`, `apps/desktop/nexus_desktop/__init__.py`, `apps/desktop/nexus_desktop/__main__.py`, `apps/desktop/nexus_desktop/config.py`, `apps/desktop/README.md`
- Move (con `git mv`, conservando historial): `scripts/ingest_demo/ingest_demo/{exif,gsd,manifest,media,mosaics,position,upload}.py` → `apps/desktop/nexus_desktop/{domain/exif.py, domain/gsd.py, nexus/manifest.py, domain/media.py, domain/mosaics.py, domain/position.py, nexus/upload.py}`; sus pruebas y fixtures → `apps/desktop/tests/`
- Modify: `.gitignore` (añadir `apps/desktop/models/*.onnx`, `apps/desktop/.venv/`, `apps/desktop/dist/`, `apps/desktop/build/`, `.ingest_index.json`)
- Delete al terminar: `scripts/ingest_demo/` (su `cli.py` se reparte en Tareas 6-8; `vnd_manifest.py` y su prueba **se eliminan**, es marca VND)

**Interfaces:**
- Produces: paquete `nexus_desktop` instalable con `pip install -e "apps/desktop[dev]"`; `config.APP_NAME = "nexus-desktop"`, `config.VERSION: str`, `config.SUPABASE_URL` / `config.SUPABASE_PUBLISHABLE_KEY` (leídos de `NEXUS_SUPABASE_URL` / `NEXUS_PUBLISHABLE_KEY`, URL por defecto `http://127.0.0.1:54321`), `config.data_dir() -> Path` (carpeta de datos del usuario, `%APPDATA%/NEXUS`).
- `manifest.SCHEMA_PATH` pasa a resolverse con `nexus_desktop/schema/ingest-manifest.v1.schema.json` (copia sincronizada; ver pasos).

- [ ] **Step 1: Write the failing test** `tests/test_config.py::test_config_defaults` — con el entorno limpio `config.SUPABASE_URL == "http://127.0.0.1:54321"` y `config.APP_NAME == "nexus-desktop"`; y `tests/test_manifest.py::test_schema_copy_matches_repo` — el JSON en `nexus_desktop/schema/` es idéntico (igual contenido) a `src/contracts/ingest-manifest.v1.schema.json`.
- [ ] **Step 2: Run** `pytest apps/desktop/tests -q` → FAIL (paquete inexistente).
- [ ] **Step 3: Crear el esqueleto y mover** los módulos con `git mv`; ajustar imports relativos (`from .exif` → `from ..domain.exif`); `manifest.build_manifest(project_id, inspection, captures, findings=None, mosaics=None) -> dict` ahora incluye `mosaics` y usa `config.APP_NAME`/`config.VERSION`; copiar el esquema a `nexus_desktop/schema/`.
- [ ] **Step 4: Run** `pytest apps/desktop/tests -q` → PASS (las pruebas movidas de exif, gsd, manifest, mosaics y position siguen verdes).
- [ ] **Step 5: Commit** (proponer): `Promover ingest_demo a apps/desktop (capa nexus y dominio)`.

### Task 2: Importador de carpeta WTG (`domain/wtg_folder.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/domain/wtg_folder.py`
- Test: `apps/desktop/tests/test_wtg_folder.py`

**Interfaces:**
- Produces: `@dataclass WtgFolder(path: Path, blades: dict[str, dict[str, list[Path]]], id_photo: Path | None, missing: list[str])`; `scan_wtg(folder: Path) -> WtgFolder`.
- `blades[blade][face]` con `blade ∈ {"A","B","C"}`, `face ∈ {"LE","TE","PS","SS"}`, fotos ordenadas por nombre. `missing` lista `"A/TE"` etc. de lo que no existe.

Debe reconocer **las tres estructuras que hoy acepta el monolito** (`_validate_wtg_structure`): (1) `Blade X|Pala X/{cara}` (la de `WTG 25`); (2) `X/{cara}` con carpetas `A`,`B`,`C`; (3) carpetas planas `…BLADE-A-TE…`; más la foto `_ID` (subcarpeta cuyo nombre termina en `_ID`, o foto suelta en la raíz). Solo `.jpg/.jpeg`.

- [ ] **Step 1: Write the failing tests**: `test_scan_blade_x_layout` (árbol `Blade A/LE/a.jpg`, `Pala B/TE/b.jpg` en `tmp_path` → `blades["A"]["LE"] == [a.jpg]`); `test_scan_abc_layout`; `test_scan_flat_layout` (`BLADE-A-TE/x.jpg`); `test_missing_faces_reported` (solo `Blade A/LE` → `missing` contiene `"A/TE"`, `"B/LE"` …); `test_id_photo_found_in_id_folder`; `test_paths_with_accents_and_spaces` (`tmp_path/"Año 2026"/"WTG 25"/"Blade A"/"LE"`); `test_ignores_non_jpeg_and_hidden`; `test_empty_folder_returns_no_blades`.
- [ ] **Step 2: Run** `pytest apps/desktop/tests/test_wtg_folder.py -q` → FAIL.
- [ ] **Step 3: Implement** `scan_wtg` reutilizando la lógica de `scan_folder` y `find_id_photo` de ingest_demo (ya movida) y añadiendo las estructuras 2 y 3.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Importador de carpeta WTG con las tres estructuras y reporte de faltantes`.

### Task 3: Medición: radio, GSD y cuerda (`domain/measurement.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/domain/measurement.py`
- Test: `apps/desktop/tests/test_measurement.py`

**Interfaces:**
- Consumes: `domain.gsd.compute_gsd(meta, width_px) -> GsdResult | None` (Task 1).
- Produces: `radius_from_altitude(alt_m: float, root_alt_m: float, tip_alt_m: float | None, blade_length_m: float) -> float` (m, acotado a `[0, blade_length_m]`); `reference_root_altitude(photos: list[tuple[str, float]]) -> float` (mínima altitud de fotos LE/TE; si no hay, la mínima global; si no hay datos, 0.0); `sequence_direction(radii_in_order: list[float]) -> Literal["root_to_tip","tip_to_root","unknown"]`.

Regla (de `_process_excel_radius` y `blade_measurement.interpolate_radius` del monolito, que el visor ya replica en `src/lib/blade/radius.ts`): radio = |alt − alt_raíz| escalado a la longitud de la pala cuando se conoce la altitud de punta; sin punta, radio = max(0, alt − alt_raíz). Resultado en metros.

- [ ] **Step 1: Write the failing tests**: `test_reference_root_prefers_le_te_minimum`; `test_reference_root_falls_back_to_global_min`; `test_reference_root_no_data_is_zero`; `test_radius_scales_to_blade_length` (`radius_from_altitude(10, 0, 20, 60) == 30`); `test_radius_without_tip_is_altitude_difference`; `test_radius_clamped_to_blade_length`; `test_radius_never_negative`; `test_sequence_direction_detects_both_ways_and_unknown`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** las tres funciones con `math`/listas puras, sin leer archivos.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Medición: radio por altitud, altitud de raíz y dirección de secuencia`.

### Task 4: Segmentador ONNX (`vision/segmenter.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/vision/segmenter.py`, `apps/desktop/models/.gitkeep`
- Test: `apps/desktop/tests/test_segmenter.py`

**Interfaces:**
- Produces: `class BladeSegmenter` con `__init__(self, model_path: Path, img_size: int = 512)`, `predict(self, img_bgr: np.ndarray, threshold: float = 0.5) -> np.ndarray` (máscara `uint8` 0/255 del mismo alto y ancho que la imagen), `bounding_box(mask) -> tuple[int,int,int,int]`; `find_model(search: list[Path]) -> Path | None`.
- Origen: `BladeSegmenter` de `blade_reconstruction_test.py:59-118` (mismo preprocesado y umbral).

- [ ] **Step 1: Write the failing tests**: `test_find_model_returns_first_existing` (dos rutas, solo la segunda existe); `test_find_model_none_when_missing`; `test_predict_returns_mask_same_size` (con un `onnx` mínimo generado en la prueba con `onnx.helper` — identidad sobre 1 canal — o, si `onnxruntime` no está, `pytest.skip`); `test_bounding_box_of_empty_mask_is_zeroes`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** copiando el preprocesado del original (BGR→RGB, resize a `img_size`, normalizar, NCHW) y devolviendo la máscara reescalada al tamaño de entrada.
- [ ] **Step 4: Run** → PASS (o skip documentado si falta onnxruntime).
- [ ] **Step 5: Commit** (proponer): `Segmentador ONNX extraído del monolito`.

### Task 5: Costura de tiras y cuerda (`vision/stitcher.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/vision/stitcher.py`, `apps/desktop/tests/test_stitcher.py`, `apps/desktop/tests/test_stitcher_wtg25.py`
- Origen: `BladeStitcher` (`blade_reconstruction_test.py:351-998`, incluye `calculate_longitudinal_chord`) y `_advanced_stitch` (`blade_importer_app.py:6583-6780`) / `_process_reconstruction` (`:6092-6421`).

**Interfaces:**
- Consumes: `vision.segmenter.BladeSegmenter` (Task 4).
- Produces: `@dataclass StripResult(image: np.ndarray, offsets: list[tuple[int,int]], chord: dict)`; `stitch_section(images: list[np.ndarray], metadata: list[dict], masks: list[np.ndarray | None], *, progress: Callable[[str], None] = lambda m: None) -> StripResult`; `chord_for_section(...)` con la firma de `calculate_longitudinal_chord`, devolviendo `{"image_centers": [...], "chord_length_px", "gsd_chord", "chord_start_tip", "chord_end_root"}` como hoy.

**Regla:** se **extrae sin cambiar el algoritmo**. Primero se fijan los resultados actuales con pruebas de caracterización; solo después se mueve el código.

- [ ] **Step 1: Write the failing tests**: `test_stitch_two_synthetic_images_recovers_known_offset` (imagen sintética con franja diagonal, partida en dos con 30 % de solape → `offsets[1]` dentro de ±3 px del real); `test_stitch_single_image_returns_it_unchanged`; `test_stitch_without_metadata_falls_back_to_simple`; `test_chord_start_and_end_inside_image_bounds`. En `test_stitcher_wtg25.py`, marcada `@pytest.mark.slow` y con `skip` si no existe `EXIF/…/WTG 25`: costura la sección `Blade A/LE` y compara dimensiones y `chord_length_px` con los valores guardados en `WTG 25/exif_data` (tolerancia 1 %).
- [ ] **Step 2: Run** `pytest apps/desktop/tests/test_stitcher.py -q` → FAIL.
- [ ] **Step 3: Move** `BladeStitcher` y `_advanced_stitch` a `vision/stitcher.py` como funciones/clase sin dependencia de Tkinter, sustituyendo `self._update_status` por el callback `progress`; borrar los `print` con emojis (usar `logging`).
- [ ] **Step 4: Run** → PASS (la prueba lenta, con `-m slow`, también si la carpeta existe).
- [ ] **Step 5: Commit** (proponer): `Costura y cuerda de tiras extraídas del monolito, con pruebas de caracterización`.

### Task 6: Índice local (`storage/local_index.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/storage/local_index.py`
- Test: `apps/desktop/tests/test_local_index.py`

**Interfaces:**
- Produces: `class LocalIndex` con `__init__(self, folder: Path)`; `capture_id(self, sha: str) -> str`; `mosaic_id(self, name: str) -> str`; `inspection_id(self, asset_id: str) -> str | None`; `set_inspection(self, asset_id: str, inspection_id: str) -> None`; `mark_uploaded(self, object_path: str) -> None`; `is_uploaded(self, object_path: str) -> bool`; `save(self) -> None`. Archivo `.ingest_index.json` dentro de la carpeta WTG (formato compatible con el de `ingest_demo`: `{"inspections", "captures", "mosaics"}` más `"uploaded"`).
- Reemplaza `load_index/save_index` de `cli.py` y la clase `LocalTurbineStorage` del monolito.

- [ ] **Step 1: Write the failing tests**: `test_capture_id_is_stable_across_reload`; `test_two_shas_get_different_ids`; `test_loads_legacy_ingest_demo_index` (archivo sin `"uploaded"`); `test_is_uploaded_survives_save_and_reload`; `test_corrupt_file_is_renamed_and_new_index_started` (JSON roto → `.bak` y arranca vacío).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** con escritura atómica (archivo temporal + `replace`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Índice local idempotente de ids y objetos subidos`.

### Task 7: Sesión y proyectos (`nexus/session.py`, `nexus/projects.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/nexus/session.py`, `apps/desktop/nexus_desktop/nexus/projects.py`
- Test: `apps/desktop/tests/test_session.py`, `apps/desktop/tests/test_projects.py`
- Origen: `fresh_token` y `resolve_inspection`/`choose_inspection` de `ingest_demo/cli.py` (y sus pruebas en `tests/test_cli.py`).

**Interfaces:**
- Produces: `class Session` con `login(email: str, password: str) -> None`, `logout() -> None`, `is_logged_in() -> bool`, `email: str | None`, `access_token() -> str` (renueva si vence en < 300 s; lanza `SessionLost` si no hay sesión), `client` (supabase). `class SessionLost(Exception)`.
- `@dataclass Project(id: str, name: str, organization_id: str)`, `@dataclass Asset(id: str, name: str, status_hint: str | None)`; `list_projects(client) -> list[Project]`; `list_assets(client, project_id: str) -> list[Asset]` (turbinas del proyecto, tabla `assets`); `choose_inspection(explicit, indexed, indexed_exists, pending, new_id=...) -> tuple[str, bool]` (misma firma que hoy); `resolve_inspection(client, project_id, asset_id, index: LocalIndex) -> str` (crea la fila `inspections` con `status='captured'` si es nueva, y falla con `InspectionLocked` si la inspección está `approved`).

- [ ] **Step 1: Write the failing tests** con un cliente falso (`FakeClient` en `tests/conftest.py`): `test_login_failure_raises_readable_error`; `test_access_token_refreshes_when_near_expiry`; `test_access_token_raises_session_lost_without_session`; `test_list_projects_empty_for_unassigned_user` (devuelve `[]`); `test_choose_inspection_order` (las cuatro ramas actuales de `test_cli.py`); `test_resolve_inspection_creates_row_before_upload`; `test_resolve_inspection_refuses_approved`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** moviendo la lógica y las pruebas existentes; los mensajes de error en español para el usuario.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Sesión, proyectos y resolución de inspección de la app`.

### Task 8: Armado del manifiesto y calibración de tiras (`nexus/builder.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/nexus/builder.py`
- Test: `apps/desktop/tests/test_builder.py`
- Origen: `build_capture`, `exif_datetime` de `ingest_demo/cli.py`; `mosaics.build_mosaic`.

**Interfaces:**
- Consumes: `LocalIndex` (Task 6), `measurement.*` (Task 3), `StripResult`/cuerda (Task 5), `domain.mosaics.build_mosaic`.
- Produces: `build_capture(path: Path, blade: str | None, face: str | None, seq: int, meta: dict, sha: str, cap_id: str, prefix: str, deriv, radius_m: float | None = None, direction: str | None = None) -> dict` (mismo resultado que hoy; el radio y la dirección vienen de `measurement`, ya no del manifiesto de VND); `build_calibration(tip_row_px: int | None, root_row_px: int | None, blade_length_m: float | None, mm_per_px: float | None, root_at_top: bool | None) -> dict`; `build_blade_manifest(project_id: str, inspection: dict, blade: str, captures: list[dict], mosaics: list[dict]) -> dict` (solo contenido de esa pala; valida con `manifest.validate`).
- Regla: `mm_per_px` y filas en el tamaño **subido** de la tira (Review Focus 6): `row_uploaded = round(row_original * uploaded_height / original_height)`.

- [ ] **Step 1: Write the failing tests**: `test_build_capture_matches_ingest_demo_output` (fixtures `m4e_wide_exif.json`: mismas claves y valores que las pruebas heredadas); `test_calibration_rows_scaled_to_uploaded_size` (tira de 16 000 px de alto reducida a 8 000 → filas a la mitad); `test_blade_manifest_contains_only_that_blade` y valida contra el esquema; `test_capture_without_gps_has_null_coordinates`; `test_id_photo_has_no_blade_block`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** moviendo `build_capture` y añadiendo `build_calibration` y `build_blade_manifest`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Manifiesto por pala con calibración de tiras`.

### Task 9: Orquestador de subida (`nexus/uploader.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/nexus/uploader.py`
- Test: `apps/desktop/tests/test_uploader.py`
- Origen: `main()` de `ingest_demo/cli.py` (sin `argparse`).

**Interfaces:**
- Consumes: `Session`, `LocalIndex`, `builder`, `domain.media`, `nexus.upload.tus_upload`, `wtg_folder.WtgFolder`.
- Produces: `@dataclass UploadPlan(folder: WtgFolder, project: Project, asset: Asset, blade_length_m: float | None, strips: dict[tuple[str,str], Path])`; `@dataclass UploadReport(inserted: dict, updated: dict, skipped: dict, errors: list[dict])`; `upload_inspection(plan: UploadPlan, session: Session, index: LocalIndex, exiftool: Path, progress: Callable[[str, float], None], cancel: threading.Event) -> UploadReport`.
- Comportamiento: sube fotos (original, preview, miniatura) → tiras → llama `ingest_manifest` una vez por pala; **salta** los objetos con `index.is_uploaded`; guarda el índice tras cada archivo; si `cancel` se activa, termina el archivo en curso y devuelve el reporte parcial; errores `manifest_invalid` se devuelven como `errors=[{"path","code"}]`.

- [ ] **Step 1: Write the failing tests** con `FakeSession`, `fake_tus` y `FakeClient.rpc`: `test_uploads_each_object_once_and_calls_ingest_per_blade`; `test_second_run_uploads_nothing_and_reports_zero_inserted`; `test_skips_corrupt_photo_and_continues` (foto ilegible → aviso en `progress`, resto sube); `test_cancel_stops_after_current_file`; `test_manifest_invalid_returns_path_and_code`; `test_refreshes_token_before_each_upload` (el fake cuenta llamadas a `access_token`); `test_identical_sha_uploaded_once`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** moviendo el bucle de `main()`; las posiciones `_ID` (`position.turbine_position`) se escriben en `inspections` tras el último manifiesto como hoy.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Orquestador de subida reanudable e idempotente`.

### Task 10: Tema NEXUS (`ui/theme.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/ui/theme.py`, `apps/desktop/nexus_desktop/ui/assets/nexus-logo.png` (copiar de `public/images/email/nexus-logo.png`)
- Test: `apps/desktop/tests/test_theme.py`

**Interfaces:**
- Produces: `TOKENS: dict[str, str]` con las claves `background, surface, raised, border, border_strong, accent, accent_button, accent_deep, telemetry, critical, caution, text, text_muted, text_subtle` y los valores de Global Constraints; `apply_theme(root: tk.Tk) -> None` (estilos ttk: `TFrame`, `Panel.TFrame`, `TLabel`, `Muted.TLabel`, `Title.TLabel`, `TButton`, `Accent.TButton`, `Danger.TButton`, `TEntry`, `TCombobox`, `Treeview`, `Horizontal.TProgressbar`); `font(size: int, weight: str = "normal") -> tuple` (Segoe UI).

- [ ] **Step 1: Write the failing tests**: `test_tokens_match_globals_css` (lee `src/app/globals.css` y comprueba que `accent-primary` HSL `218 99% 59%` equivale a `TOKENS["accent"]` con tolerancia de 2 por canal; omitir si el archivo no está); `test_apply_theme_defines_accent_button_style` (con `tk.Tk()`; omitir si no hay pantalla).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** con `ttk.Style().theme_use("clam")` y configuración por token.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Tema NEXUS para ttk`.

### Task 11: Ventana principal, login y selección de proyecto (`ui/`)

**Files:**
- Create: `apps/desktop/nexus_desktop/ui/app.py`, `ui/screens/login.py`, `ui/screens/start.py`, `ui/screens/base.py`
- Test: `apps/desktop/tests/test_ui_flow.py`

**Interfaces:**
- Produces: `class App(tk.Tk)` con `show(screen_cls, **kwargs)`, `session: Session`, `state: AppState`; `@dataclass AppState(wtg: WtgFolder | None, project: Project | None, asset: Asset | None, blade_length_m: float | None, strips: dict, ...)`; `class Screen(ttk.Frame)` base con `on_show()`; pantallas `LoginScreen`, `StartScreen` (lista de proyectos → turbinas → botón "Importar carpeta WTG", y la lista de inspecciones locales pendientes).
- Inicio **no usa texto de VND**; título de ventana `NEXUS · Importador de palas`.

- [ ] **Step 1: Write the failing tests** (Tk con `root.update()`; omitir sin pantalla): `test_login_screen_calls_session_login_and_shows_start`; `test_login_error_is_shown_not_raised`; `test_start_lists_projects_and_handles_empty` (usuario sin proyectos → etiqueta "No tienes proyectos asignados").
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** las pantallas con el tema (Task 10); las llamadas de red van en un hilo con `after()` para no congelar la ventana (`ui/threading.py: run_async(fn, on_done, on_error)`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `App principal con login y selección de proyecto y turbina`.

### Task 12: Importación y marcado de punta y raíz (`ui/screens/import_.py`, `marking.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/ui/screens/import_.py`, `ui/screens/marking.py`, `domain/marking.py`
- Test: `apps/desktop/tests/test_marking.py`, ampliar `test_ui_flow.py`
- Origen: `_show_import_dialog`, `_show_marking_screen`, `_on_image_click`, `_draw_*_marker`, `_is_blade_complete` (`blade_importer_app.py:1948`, `5263-5970`).

**Interfaces:**
- Produces (lógica pura, sin Tk): `@dataclass Mark(x: float, y: float)`; `@dataclass SectionMarks(tip: Mark | None, root: list[Mark])`; `class MarkingState` con `set_tip(blade, face, image_index, mark)`, `add_root_click(blade, face, image_index, mark)` (la raíz son 2 clics, como hoy), `is_section_complete(blade, face) -> bool`, `is_blade_complete(blade) -> bool`, `is_complete() -> bool`.
- `ImportScreen`: elegir carpeta → `scan_wtg` → muestra palas/caras y `missing`; pide longitud de pala (m) y confirma; `MarkingScreen`: miniaturas en caché de disco, clic para marcar, resalta lo faltante.

- [ ] **Step 1: Write the failing tests**: `test_root_needs_two_clicks_before_complete`; `test_blade_complete_requires_all_present_sections` (solo las caras que existen en `WtgFolder`); `test_set_tip_replaces_previous_mark`; `test_import_screen_shows_missing_faces` (UI).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `MarkingState` primero; luego las pantallas apoyadas en él, con miniaturas por `Pillow` y caché en `config.data_dir()/thumbs`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Importación de carpeta WTG y marcado de punta y raíz`.

### Task 13: Procesamiento, resultados y verificación (`ui/screens/processing.py`, `results.py`, `verification.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/domain/reconstruction.py`, `ui/screens/processing.py`, `ui/screens/results.py`, `ui/screens/verification.py`
- Test: `apps/desktop/tests/test_reconstruction.py`
- Origen: `_process_reconstruction` (`:6092-6421`), `_show_results_screen`, `_show_verification_screen`.

**Interfaces:**
- Consumes: `scan_wtg`, `BladeSegmenter`, `stitch_section`, `measurement.*`, `MarkingState`, `LocalIndex`.
- Produces: `@dataclass SectionResult(blade: str, face: str, strip_path: Path, width_px: int, height_px: int, calibration: dict, photos: list[PhotoResult])`; `reconstruct(wtg: WtgFolder, marks: MarkingState, blade_length_m: float, segmenter: BladeSegmenter | None, exiftool: Path, out_dir: Path, progress: Callable[[str, float], None], cancel: threading.Event) -> list[SectionResult]` (tiras guardadas como `{out_dir}/{wtg}_img_stitched/{wtg}_{A|B|C}_{LeadingEdge|PressureSide|SuctionSide|TrailingEdge}.jpg`, nombre que `mosaics.scan` ya reconoce).
- Si no hay modelo ONNX: costura simple con aviso (como hoy). `ResultsScreen` y `VerificationScreen` muestran las tiras y las fotos con radio y GSD calculados; el botón "Subir" pasa a la pantalla de subida.

- [ ] **Step 1: Write the failing tests**: `test_reconstruct_writes_strip_with_expected_name`; `test_reconstruct_without_model_still_produces_strips_and_warns`; `test_reconstruct_cancel_returns_partial_results`; `test_calibration_uses_marks_and_blade_length` (punta y raíz conocidas → `mm_per_px == blade_length_m*1000 / |root_row − tip_row|`, `root_at_top` según la posición relativa).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `reconstruct` y las pantallas; el cálculo corre en hilo con progreso.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Reconstrucción, resultados y verificación sobre los módulos nuevos`.

### Task 14: Pantalla de subida y cierre del flujo (`ui/screens/upload.py`)

**Files:**
- Create: `apps/desktop/nexus_desktop/ui/screens/upload.py`
- Test: ampliar `apps/desktop/tests/test_ui_flow.py`

**Interfaces:**
- Consumes: `upload_inspection` y `UploadReport` (Task 9).
- Produces: `UploadScreen` con barra de progreso, registro de avisos, botón Cancelar, reporte final (insertados, actualizados, omitidos) y, si hay `errors`, tabla de `path` y `code` con textos en español por código; en `SessionLost` vuelve al login y conserva el avance (índice).

- [ ] **Step 1: Write the failing tests**: `test_upload_screen_shows_report_counts`; `test_upload_screen_shows_manifest_errors_in_spanish` (`bad_path`, `missing_object`, `inspection_locked`); `test_session_lost_returns_to_login`; `test_cancel_sets_event`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** con `run_async` y un diccionario `ERROR_TEXT: dict[str, str]` para los códigos del contrato (§8.3).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (proponer): `Pantalla de subida con reporte y errores legibles`.

### Task 15: Empaquetado, instalador y limpieza final

**Files:**
- Create: `apps/desktop/packaging/nexus_desktop.spec`, `apps/desktop/packaging/build.ps1`, `apps/desktop/requirements.txt` (ya sin torch ni segmentation-models)
- Modify: `apps/desktop/README.md`
- Delete: `scripts/ingest_demo/` (su contenido ya vive en `apps/desktop`; actualizar referencias en `docs/`)
- Test: `apps/desktop/tests/test_packaging_smoke.py`

**Interfaces:**
- Produces: `build.ps1` que genera `dist/NEXUS-Importador/NEXUS-Importador.exe` con exiftool, el logo y `models/blade_unet_512.onnx` (copiado a mano; el script falla con mensaje claro si no está).

- [ ] **Step 1: Write the failing test** `test_entrypoint_imports_without_display` (`python -c "import nexus_desktop.__main__"` no abre ventana) y `test_no_service_role_or_vnd_strings_in_package` (busca en `apps/desktop/nexus_desktop`: `service_role`, `SERVICE_ROLE`, `hermes`, `VIND`, `VND`, `@Miui` → ninguna coincidencia).
- [ ] **Step 2: Run** → FAIL (hasta limpiar).
- [ ] **Step 3: Implement** spec de PyInstaller, `build.ps1` y README (instalación, variables `NEXUS_SUPABASE_URL`, `NEXUS_PUBLISHABLE_KEY`, cómo construir el instalable); eliminar `scripts/ingest_demo/`.
- [ ] **Step 4: Run** `pytest apps/desktop/tests -q` (toda la suite) y `powershell apps/desktop/packaging/build.ps1` → PASS y `.exe` generado.
- [ ] **Step 5: Verificación manual con Supabase local** (`supabase start`): iniciar sesión con el usuario técnico de `seed.sql`, importar `WTG 25`, marcar, reconstruir, subir; segunda subida debe dar `inserted = 0`. Reportar el resultado.
- [ ] **Step 6: Commit** (proponer): `Empaquetado de la app de escritorio y retiro de ingest_demo`.
