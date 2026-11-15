# Inspecciones NEXUS · Fase 1: base de datos, aislamiento por cliente y contrato de subida

Fecha: 11/11/2026 · Estado: borrador para revisión · Autor del producto: líder de desarrollo de NEXUS (autor de VND Platform v2)

---

## 1. Propósito y alcance

### 1.1 Qué se busca

NEXUS va a mostrar en su portal los resultados de inspecciones con drones en tres ámbitos:

| Ámbito | Espectros |
|---|---|
| Palas de aerogeneradores | RGB y térmico |
| Plantas solares | RGB y térmico |
| Líneas de transmisión | RGB (y nube de puntos en su fase) |

**Todo el procesamiento pesado ocurre en una app de PC**: lectura de metadatos, cálculo de escala, segmentación, unión de fotos, extracción de temperaturas y detección de daños. **El portal solo muestra**, permite corregir valores y daños, y comentar.

**Éxito:** abrir una inspección en el navegador y revisarla, medir y ver sus daños sin otra herramienta, con la garantía de que **cada cliente ve únicamente sus datos** y los dueños de NEXUS ven todo.

### 1.2 Fases del proyecto completo

| Fase | Contenido | Documento |
|---|---|---|
| **1. Base** | Esquema, reglas de acceso, Storage, contrato de subida, admin mínimo | **Este** |
| 2. App de PC v1 (palas) | Reutiliza la lógica y el modelo de segmentación de `EXIF/` (VND) con una interfaz nueva; la detección de daños corre en Hugging Face | Pendiente |
| 3. Visor de palas | Regla virtual, térmico, edición de daños, comentarios | Pendiente |
| 4. Plantas solares | Ortomosaico en mapa, anomalías térmicas | Pendiente |
| 5. Líneas de transmisión | Mapa de torres y tramos, nube de puntos | Pendiente |

### 1.3 Fuera del alcance de NEXUS (decisión definitiva)

Pruebas de pararrayos (LPS), instrumentos (miliohmetro), catálogo de pilotos y apps Android. No se diseñan ni se dejan previstos.

### 1.4 Reglas de trabajo

- **Todo se desarrolla en local** (Supabase en Docker). No se toca el proyecto de producción `swedqyjhepghtwrmzlth` sin confirmación explícita.
- **Ningún commit, push ni subida de archivos sin confirmación explícita** en cada ocasión.
- Las fotos, incluidos los originales, se guardan en Supabase Storage (en local durante el desarrollo; en la nube cuando se haga el salto de plan).

---

## 2. Referencia: base de VND y qué se cambia

Base revisada (solo lectura): proyecto `tddtfhmkjlpbcqtahcgf`.

| De VND se conserva | De VND se corrige |
|---|---|
| Funciones únicas de permiso (`can_read_project`, `can_write_project`) usadas por todas las reglas | Buckets `images`, `certificates` y `lps` **públicos**: cualquiera con la URL abre la foto. Aquí todo es privado con enlaces firmados |
| Flujo foto → daño, severidad 1–5, región en la imagen, datos de IA aparte | `projects.client` es texto y el enlace con `companies` se hace por nombre. Aquí el proyecto pertenece a una organización por clave foránea |
| Metadatos de vuelo por foto (GPS, gimbal, láser, GSD, altura) | Solo contempla palas. Aquí sitios y activos son genéricos |
| Rol de cuenta de servicio para la IA | Daños sin estado, comentarios ni historial |
| Funciones `security definer` con `search_path` vacío | Reglas que recorren 4 tablas por fila (foto → pala → turbina → proyecto). Aquí cada tabla hija lleva su `project_id` |
| | Rol en dos lugares (`user_profiles.role` y `project_access.role`), políticas duplicadas en `wtgmFile`, secciones como texto libre |
| | Unidades mezcladas (heurística «> 200 = mm»). Aquí cada columna lleva su unidad en el nombre |

La migración actual del repo (`supabase/migrations/20261108000000_initial_schema.sql`) **no es referencia** y se reemplaza (ver §9).

---

## 3. Usuarios, roles y aislamiento

### 3.1 Roles

| Rol | Dónde se guarda | Ve | Puede |
|---|---|---|---|
| `admin` (dueños de NEXUS) | `profiles.platform_role` | Todo | Todo; único que aprueba inspecciones, borra daños y edita lo aprobado |
| `technician` (personal de NEXUS) | `profiles.platform_role` | Proyectos asignados | Subir datos, corregir valores y daños, comentar |
| `service` (procesos automáticos) | `profiles.platform_role` | Proyectos asignados | Escribir resultados; no borra ni comenta |
| `client_manager` | `organization_members.role` | Todo lo de su organización | Ver, comentar, marcar daños como revisados |
| `client_viewer` | `organization_members.role` | Todo lo de su organización | Ver y descargar |

Un usuario es **o personal de NEXUS** (`platform_role` no nulo) **o usuario de cliente** (fila en `organization_members`), nunca ambos; un trigger lo impide. Un usuario de cliente puede pertenecer a más de una organización.

### 3.2 Altas

- Registro público desactivado (`enable_signup = false` ya está en `supabase/config.toml`).
- El admin invita por correo desde el portal (acción de servidor con la llave de servicio, que vive solo en el servidor). En local los correos llegan al buzón de prueba (Mailpit).
- El trigger `handle_new_user` crea el perfil **sin rol**. Los primeros admins se asignan una vez con SQL.

### 3.3 Funciones de permiso (`private`, `security definer`, `search_path = ''`)

| Función | Verdadero cuando |
|---|---|
| `is_admin()` | `platform_role = 'admin'` y perfil activo |
| `is_staff()` | `platform_role in ('admin','technician')` y activo |
| `is_assigned(p)` | Existe fila en `project_assignments` para el usuario y el proyecto |
| `org_of_project(p)` | Devuelve `projects.organization_id` |
| `can_read_org(o)` | Admin, miembro de `o`, o asignado a algún proyecto de `o` |
| `can_read_project(p)` | Admin, asignado a `p`, o miembro de la organización de `p` |
| `can_write_project(p)` | Admin, o asignado a `p` con rol `technician` o `service` |
| `can_comment_project(p)` | Admin, técnico asignado, o `client_manager` de la organización de `p` |
| `inspection_is_locked(i)` | `inspections.status = 'approved'` |

Todas las funciones exigen además que el perfil del usuario esté activo (`profiles.is_active`): desactivar a alguien le quita el acceso al instante.

Regla de escritura en datos de inspección: `can_write_project(project_id) and (not inspection_is_locked(inspection_id) or is_admin())`.

### 3.4 Garantías de aislamiento

1. **RLS activado en todas las tablas**, siempre a través de las funciones de §3.3.
2. **`project_id` en cada tabla hija** (`captures`, `blade_captures`, `thermal_captures`, `mosaics`, `findings`, `comments`, `change_log`). Un trigger exige que coincida con el del padre; así nadie puede colgar una fila de un proyecto ajeno.
3. **Coherencia de organización**: `assets.organization_id = sites.organization_id`, y los sitios de `project_sites` deben ser de la organización del proyecto (triggers).
4. **Storage privado** con la organización y el proyecto en la ruta (§7).
5. **Pruebas automáticas** de aislamiento (§10) que deben pasar antes de dar la fase por terminada.

---

## 4. Catálogo y proyectos

### 4.1 Tipos

```
site_kind          wind_farm | solar_plant | transmission_line
asset_kind         wind_turbine | solar_block | transmission_tower | transmission_span
project_status     planned | in_field | processing | in_review | delivered | archived
inspection_kind    wind_blade | solar | transmission
inspection_status  pending | captured | processing | in_review | approved
```

### 4.2 Tablas

**`organizations`**: `id`, `name`, `slug` (único), `created_at`, `updated_at`.

**`profiles`**: `id` (= `auth.users.id`), `email`, `full_name`, `platform_role` (nulo para clientes), `is_active`, fechas.

**`organization_members`**: `organization_id`, `user_id`, `role` (`client_manager` | `client_viewer`), `created_at`. PK compuesta.

**`sites`**: `id`, `organization_id`, `kind`, `name`, `lat`, `lon`, `notes`, fechas. Único `(organization_id, name)`.

**`assets`**: `id`, `organization_id`, `site_id`, `kind`, `name`, `code`, `lat`, `lon`, fechas. Único `(site_id, name)`.

**`wind_turbine_specs`**: `asset_id` (PK), `manufacturer`, `model`, `blade_length_m`, `rotor_diameter_m`, `hub_height_m`, `wtgm` (jsonb, geometría del generador `.wtgm`).

**`projects`**: `id`, `organization_id`, `name`, `code`, `status`, `start_date`, `end_date`, `contacts` (jsonb: lista de `{role, name, email}`), `notes`, `created_by`, fechas.

**`project_sites`**: `project_id`, `site_id`. PK compuesta.

**`project_assignments`**: `project_id`, `user_id`, `assigned_by`, `assigned_at`. Solo usuarios con `platform_role in ('technician','service')`.

**`inspections`**: `id`, `project_id`, `asset_id`, `kind`, `status`, `inspected_at`, `pilot_name`, `assistant_name`, `drone_model`, `id_capture_id` (foto de identificación), `blade_length_m` (copia del valor usado; una corrección del catálogo no altera lo entregado), `notes`, `approved_at`, `approved_by`, fechas. Único `(project_id, asset_id, kind)`.

### 4.3 Escritura

- `organizations`, `organization_members`, `sites`, `assets`, `wind_turbine_specs`, `projects`, `project_sites`, `project_assignments`, `finding_types`: solo admin.
- `inspections`: crear y editar con permiso de escritura del proyecto; **pasar a `approved` o salir de `approved` solo el admin** (trigger).
- Lectura: según `can_read_org` o `can_read_project`.

---

## 5. Fotos, datos por tipo y tiras unidas

### 5.1 Tipos

```
spectrum            rgb | thermal
gsd_source          lrf | altitude | focus | manual | mosaic_calibration
confidence_level    high | medium | low
blade_position      A | B | C
blade_face          TE | PS | LE | SS
sequence_direction  root_to_tip | tip_to_root | unknown
mosaic_kind         blade_strip          (ortomosaicos en la fase 4)
mosaic_format       image | dzi
```

### 5.2 `captures` (común a los tres ámbitos)

| Grupo | Columnas |
|---|---|
| Identidad | `id`, `project_id`, `inspection_id`, `spectrum`, `sha256`, `file_name`, `sequence_index` |
| Archivos | `original_path`, `preview_path`, `thumb_path`, `width_px`, `height_px` |
| Vuelo | `captured_at`, `lat`, `lon`, `alt_abs_m`, `alt_rel_m`, `gimbal_pitch_deg`, `gimbal_roll_deg`, `gimbal_yaw_deg`, `drone_model`, `camera_model`, `lrf_distance_m` |
| Escala | `gsd_mm_px`, `gsd_source`, `gsd_confidence` |
| Relación | `paired_capture_id` (RGB ↔ térmica tomadas a la vez, sufijos `_V` / `_T` de DJI) |
| Resto | `metadata` (jsonb con todos los metadatos), fechas |

Único `(inspection_id, sha256)`.

### 5.3 `blade_captures` (solo palas)

`capture_id` (PK), `project_id`, `blade` (A/B/C), `face` (TE/PS/LE/SS), `radius_center_m`, `sequence_direction`, `chord_length_mm`.

### 5.4 `thermal_captures` (solo térmicas)

`capture_id` (PK), `project_id`, `matrix_path`, `temp_scale`, `temp_offset`, `t_min_c`, `t_max_c`, `emissivity`, `distance_m`, `humidity_pct`, `ambient_temp_c`, `reflected_temp_c`.

**Matriz de temperaturas**: PNG de 16 bits, un canal, mismo tamaño que la imagen térmica. `temperatura_°C = valor × temp_scale + temp_offset` (por defecto `0.01` y `-100`: resolución de 0.01 °C, rango −100 a 555 °C). La app la genera con el DJI Thermal SDK; el navegador no decodifica R-JPEG.

### 5.5 `mosaics` (tiras unidas)

`id`, `project_id`, `inspection_id`, `kind`, `spectrum`, `blade`, `face`, `format` (`image` = un archivo; `dzi` = mosaico de cuadros Deep Zoom para archivos que superen el límite por archivo), `path` (archivo o archivo `.dzi`), `width_px`, `height_px`, calibración (`tip_row_px`, `root_row_px`, `blade_length_m`, `mm_per_px`, `root_at_top`), `calibrated_by`, `calibrated_at`, fechas. Único `(inspection_id, kind, spectrum, blade, face)`.

### 5.6 Unidades y fórmulas

- Toda columna lleva su unidad en el nombre (`_m`, `_mm`, `_px`, `_deg`, `_c`, `_pct`). No hay heurísticas de conversión.
- **GSD (lo calcula la app)**: con `CalibratedFocalLength` de DJI (en píxeles), `gsd_mm_px = distancia_m × 1000 / focal_px`; no depende del tamaño del sensor. Respaldo: `distancia_mm × ancho_sensor_mm / (focal_mm × ancho_px)`, con una **tabla de sensores por modelo de cámara** (corrige el 13.2 vs 17.3 mm de la app actual).
- Prioridad de la distancia, igual que en VND: láser (`high`), altitud relativa con gimbal (`medium`), distancia de foco (`low`).
- Las fórmulas del visor (regla virtual, radio por fila, áreas) están en `material/FRONTEND_MEDICION_Y_VISORES.md` y se aplican en la fase 3, corrigiendo las 9 inconsistencias que lista.

---

## 6. Daños, comentarios e historial

### 6.1 Tipos

```
finding_status  detected | confirmed | dismissed
finding_source  ai | manual
```

### 6.2 `finding_types` (catálogo editable)

`id`, `domain` (`inspection_kind`), `code`, `label_es`, `label_en`, `is_active`. Único `(domain, code)`. Lectura: cualquier usuario autenticado. Escritura: admin. La semilla incluye tipos iniciales para palas (erosión del borde de ataque, grieta, delaminación, impacto de rayo, contaminación, pintura faltante, otro).

### 6.3 `findings`

| Grupo | Columnas |
|---|---|
| Ubicación | `id`, `project_id`, `inspection_id`, `capture_id` **o** `mosaic_id` (exactamente uno, por `check`) |
| Clasificación | `type_id`, `severity` (1–5), `status` |
| Revisión del cliente | `client_reviewed_at`, `client_reviewed_by` |
| Región | `region` (jsonb: `{"type": "box" \| "polygon", "points": [[x,y], …]}` con coordenadas 0–1; validado por `check`) |
| Medidas | `width_mm`, `length_mm`, `area_mm2`, `radius_m`, `max_temp_c`, `delta_t_c`, `gsd_mm_px_used` |
| Origen | `source`, `created_by`, `ai_confidence` (0–1), `ai_model`, `ai_model_version`, `ai_original` (jsonb) |
| Corrección | `corrected_at`, `corrected_by` (los pone un trigger cuando el personal modifica un daño ya creado; no cuenta la actualización que hace `ingest_manifest`, que marca su transacción con `set_config('nexus.ingest', 'on', true)`) |
| Resto | `notes`, fechas |

Reglas:
- `ai_original` guarda el resultado del modelo al crearse y **no se puede modificar** (trigger). Sirve para reentrenar.
- Borrar: solo admin. Los técnicos usan `status = 'dismissed'`.
- El cliente no actualiza la tabla. Marca la revisión con la función `mark_finding_reviewed(finding_id)` (`security definer`), que exige `client_manager` de la organización del proyecto y solo toca `client_reviewed_at` y `client_reviewed_by`.
- Colores de severidad: Cat 1 `#10B981`, Cat 2 `#84CC16`, Cat 3 `#F59E0B`, Cat 4 `#F97316`, Cat 5 `#EF4444`.

### 6.4 `comments`

`id`, `project_id`, `inspection_id` (obligatorio), `finding_id` (opcional: si está, el comentario es de ese daño), `author_id`, `body`, `created_at`, `edited_at`.
- Crear: `can_comment_project`, con `author_id = auth.uid()`.
- Editar: solo el autor (se marca `edited_at`). Borrar: el autor o el admin.

### 6.5 `change_log`

`id` (bigint), `project_id`, `table_name`, `row_id`, `action` (`insert` | `update` | `delete`), `actor_id`, `old` (jsonb), `new` (jsonb, solo columnas cambiadas), `at`.

- Lo llena un trigger en: `findings`; `captures` (campos de escala); `blade_captures` (`radius_center_m`, `face`); `mosaics` (calibración); `inspections` (`blade_length_m`, `status`).
- La función del trigger es `security definer` (dueño `postgres`) para poder insertar aunque el usuario no tenga permiso sobre la tabla.
- **Sin políticas de escritura** y con un trigger que rechaza `update` y `delete`: nadie lo altera desde la aplicación.
- Lectura: personal de NEXUS con acceso al proyecto. El cliente ve solo `corrected_at` en cada daño («corregido por NEXUS el …»).

### 6.6 Bloqueo por aprobación

Con `inspections.status = 'approved'`, nadie salvo el admin crea, edita ni borra fotos, datos de pala o térmicos, tiras, calibraciones ni daños de esa inspección. Los comentarios siguen permitidos.

---

## 7. Storage

- **Bucket `inspection-media`, privado.** Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`, `image/tiff`, `application/xml` (`.dzi`).
- Límite por archivo: 50 GiB en local; en la nube, el del plan (50 MB en Free). Por eso las tiras grandes van en formato `dzi`.
- **Rutas**:

```
{organization_id}/{project_id}/{inspection_id}/captures/{capture_id}/original.jpg
                                                                    /preview.webp   (2560 px lado mayor)
                                                                    /thumb.webp     (400 px)
                                                                    /thermal.png    (matriz de 16 bits)
{organization_id}/{project_id}/{inspection_id}/mosaics/{mosaic_id}/…
```

- **Políticas sobre `storage.objects`**, mediante `private.storage_can_read(name)` y `private.storage_can_write(name)`:
  - leen el segmento 1 (organización), el 2 (proyecto) y el 3 (inspección);
  - exigen que el proyecto pertenezca a esa organización y la inspección a ese proyecto;
  - leer: `can_read_project`. Subir y reemplazar: permiso de escritura y la inspección no aprobada (salvo admin). Borrar: solo admin.
- **Acceso desde el portal**: enlaces firmados de 1 hora, generados en el servidor **con la sesión del usuario** (vuelve a pasar por las políticas), en lote por página.

---

## 8. Contrato de subida (app de PC → Supabase)

### 8.1 Flujo

1. El técnico inicia sesión en la app con correo y contraseña (Supabase Auth). La app solo contiene la URL y la llave **pública**. **Nunca una llave de servicio.**
2. La app pide los proyectos asignados; las reglas solo devuelven esos.
3. La app genera los `id` (UUID v4) de inspección, fotos, tiras y daños, y los guarda en su índice local. Así las rutas se conocen antes de subir y repetir es seguro.
4. Sube los archivos **directo a Supabase Storage** con subida reanudable (protocolo TUS, fragmentos de 6 MB; en Python, `tuspy`). No pasa por Hostinger.
5. Llama a la función `ingest_manifest(manifest jsonb)` con el manifiesto.
6. La inspección pasa a `in_review`.

### 8.2 Manifiesto v1 (resumen; el esquema completo va en `src/contracts/ingest-manifest.v1.schema.json`, junto al esquema Zod `src/contracts/ingest-manifest.ts`)

```json
{
  "manifest_version": 1,
  "generated_at": "2026-11-11T10:00:00Z",
  "app": { "name": "nexus-desktop", "version": "0.1.0" },
  "project_id": "uuid",
  "inspection": {
    "id": "uuid", "asset_id": "uuid", "kind": "wind_blade",
    "inspected_at": "…", "pilot_name": "…", "assistant_name": "…",
    "drone_model": "…", "blade_length_m": 61.2, "id_capture_id": "uuid | null"
  },
  "captures": [{
    "id": "uuid", "sha256": "…", "spectrum": "rgb", "file_name": "DJI_…_V.JPG",
    "sequence_index": 12,
    "paths": { "original": "…", "preview": "…", "thumb": "…" },
    "width_px": 5280, "height_px": 3956, "captured_at": "…",
    "gps": { "lat": 0, "lon": 0, "alt_abs_m": 0, "alt_rel_m": 0 },
    "gimbal": { "pitch_deg": 0, "roll_deg": 0, "yaw_deg": 0 },
    "drone_model": "…", "camera_model": "…", "lrf_distance_m": 8.4,
    "gsd": { "mm_px": 0.62, "source": "lrf", "confidence": "high" },
    "paired_capture_id": null,
    "blade": { "position": "A", "face": "LE", "radius_center_m": 34.1,
               "sequence_direction": "root_to_tip", "chord_length_mm": 2100 },
    "thermal": null,
    "metadata": {}
  }],
  "mosaics": [],
  "findings": [{
    "id": "uuid", "capture_id": "uuid", "type_code": "erosion_le", "severity": 3,
    "region": { "type": "box", "points": [[0.41, 0.22], [0.47, 0.30]] },
    "measurements": { "width_mm": 85, "length_mm": 140, "area_mm2": 11900, "radius_m": 34.6 },
    "source": "ai", "ai": { "confidence": 0.87, "model": "blade-damage", "version": "1.0.0" }
  }]
}
```

### 8.3 Reglas de `ingest_manifest`

- `security invoker`: corre con los permisos del usuario, así que las reglas de §3 aplican igual.
- **Todo o nada**: una sola transacción.
- Valida: versión soportada; permiso de escritura en el proyecto; inspección no aprobada; cada ruta empieza con `{org}/{project}/{inspection}/` y **existe** en `storage.objects`; `asset_id` de la organización del proyecto; `type_code` existente para el ámbito.
- Inserta o actualiza por `id`. Si llega el mismo archivo (`sha256`) con otro `id` en la misma inspección, responde error con la lista de duplicados.
- Puede llamarse varias veces por inspección (por ejemplo, un manifiesto por pala, o uno con solo los daños que devuelve Hugging Face); es acumulativo. Los daños pueden apuntar a fotos o tiras del mismo manifiesto o ya guardadas en esa inspección.
- Los daños de IA ya corregidos por el personal (`corrected_at` no nulo) **no se sobrescriben**; se informan como omitidos.
- Devuelve `{ inserted, updated, skipped, errors }` por tipo de registro.
- El esquema se valida en los dos lados: Zod en el portal (tipos compartidos) y pydantic en la app.

---

## 9. Entorno y cambios en el repo

### 9.1 Supabase local

- `supabase start` con Docker Desktop. Studio, API, Auth, Storage y Mailpit en `localhost`.
- **Migraciones nuevas** en `supabase/migrations/`, que **reemplazan** `20261108000000_initial_schema.sql`. Se divide por tema: tipos y perfiles, catálogo y proyectos, capturas y tiras, daños y comentarios, historial, Storage, `ingest_manifest`.
- `assessment_requests` se conserva **idéntica a producción** (misma definición y políticas), para que el futuro salto a la nube no choque. Alinear el historial de migraciones con la nube se hace ese día, con confirmación.
- `supabase/seed.sql`: organizaciones «Cliente A» y «Cliente B», un usuario por rol, un parque con una turbina y sus especificaciones, un proyecto por cliente, asignaciones y tipos de daño.
- Script `scripts/seed-media` (local): toma fotos de ejemplo de `EXIF/` (ignorada por Git) y las sube con el contrato de §8. No sube nada al repositorio.

### 9.2 Next.js

- **Variables**: `.env.development.local` (ignorado por Git) apunta al Supabase local en `next dev`. `next build` / `next start` siguen usando la configuración de producción.
- **`INSPECTIONS_ENABLED`**: si no vale `true`, las rutas nuevas responden 404 y sus enlaces no aparecen. En Hostinger no se define.
- **Rutas nuevas**:
  - `/admin/inspecciones/…` para el personal de NEXUS, con selector de organización.
  - `/portal/…` para clientes: inicio de sesión y la lista de proyectos e inspecciones de su organización (solo lectura en esta fase).
  - `src/proxy.ts` también protege `/portal`.
- **Admin actual**: `/admin` y `/admin/solicitudes` siguen usando `ADMIN_EMAILS` en esta fase, para no romper producción. Las secciones de inspecciones usan `profiles.platform_role`. Se unifican el día del salto.
- Las acciones que usan la llave de servicio (invitar usuarios) viven solo en el servidor, como el `createServiceClient` actual.

### 9.3 Admin mínimo de la fase 1

| Pantalla | Qué permite |
|---|---|
| Organizaciones | Crear, renombrar, ver miembros |
| Usuarios | Invitar por correo, asignar rol de plataforma u organización y rol, desactivar |
| Sitios y activos | Crear y editar parques y turbinas, con especificaciones de turbina |
| Proyectos | Crear y editar, ligar sitios, asignar técnicos y servicios, cambiar estado |
| Inspecciones | Lista por proyecto con estado, conteo de fotos y miniaturas firmadas; aprobar (solo admin) |

Los visores, la regla virtual, el térmico y la edición de daños son de la fase 3.

### 9.4 Prueba del contrato en Python

`scripts/ingest_demo/` (Python): inicia sesión como técnico; lee una carpeta `Pala X/Sección/`; extrae metadatos con exiftool; calcula el GSD (§5.6); genera `preview.webp` y `thumb.webp`; sube por TUS; arma y envía el manifiesto. Demuestra el contrato antes de rehacer la app de PC (fase 2).

---

## 10. Pruebas

### 10.1 Base de datos (`supabase test db`, pgTAP en `supabase/tests/`)

| # | Comprobación |
|---|---|
| 1 | Un usuario del cliente A no lee, lista ni cuenta filas del cliente B en ninguna tabla |
| 2 | Un usuario del cliente A no lista, descarga ni firma archivos del cliente B en Storage |
| 3 | Un técnico solo ve y escribe en proyectos asignados |
| 4 | Un técnico no puede subir un archivo a la carpeta de una organización que no corresponde al proyecto |
| 5 | Una fila hija con `project_id` distinto al de su padre se rechaza |
| 6 | `client_manager` comenta y marca revisado, pero no cambia severidad, tipo, región ni medidas |
| 7 | `client_viewer` no comenta |
| 8 | `change_log` registra cada corrección y rechaza `update` y `delete` |
| 9 | `ai_original` no cambia al corregir un daño |
| 10 | Con la inspección aprobada, solo el admin modifica datos |
| 11 | Solo el admin aprueba, desaprueba y borra daños |
| 12 | Un usuario no puede ser personal de NEXUS y miembro de cliente a la vez |
| 13 | `ingest_manifest`: todo o nada; idempotente; rechaza rutas inexistentes o ajenas; respeta daños corregidos; acepta un manifiesto de solo daños que apunte a fotos ya guardadas; la cuenta `service` puede usarlo y no puede borrar |
| 14 | Un usuario anónimo no lee ni escribe nada en las tablas y el bucket nuevos; `assessment_requests` conserva sus políticas actuales |

### 10.2 Aplicación

- Pruebas del esquema del manifiesto: ejemplos válidos e inválidos contra Zod y contra el JSON Schema (deben coincidir).
- Prueba de punta a punta en local: el script de §9.4 sube una inspección, el admin la ve en `/admin/inspecciones` y un usuario del cliente B no la ve en `/portal`.
- `npm run build` y `tsc` sin errores; con `INSPECTIONS_ENABLED` sin definir, las rutas nuevas responden 404.

---

## 11. Decisiones y temas abiertos

### 11.1 Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Enfoque B: patrón de VND generalizado | Reutiliza lo probado, admite los tres ámbitos y corrige el aislamiento |
| Organización dueña del proyecto por clave foránea | Separación real por cliente |
| `project_id` en cada tabla hija | Reglas rápidas y verificables |
| Buckets privados y enlaces firmados | Los públicos exponen fotos de clientes |
| Subida directa a Supabase con TUS + `ingest_manifest` | Sin llaves maestras, reanudable, todo o nada, sin pasar por Hostinger |
| Unidades en el nombre de la columna | Elimina las heurísticas de mm/m |
| Desarrollo local con Docker | Sin costo ni límites; mismo comportamiento que la nube |

| La app de PC solo segmenta la pala (U-Net de `EXIF/`); la **detección de daños corre en Hugging Face** | Decisión del dueño del producto |
| Los resultados de Hugging Face entran por el mismo contrato (`ingest_manifest`, §8) con una **cuenta `service`** asignada al proyecto, que inicia sesión como cualquier usuario | Sin llaves maestras en el proceso de IA (la versión de VND usaba la llave `service_role`) |
| **No se importa nada de VND ni de otras fuentes**: organizaciones, sitios, activos y proyectos se capturan desde cero en NEXUS | Decisión del dueño del producto |

Consecuencia en §8.3: un manifiesto puede traer **solo daños** (`captures` vacío) que apunten a fotos o tiras ya guardadas en esa inspección; `ingest_manifest` acepta referencias a `capture_id` y `mosaic_id` existentes en la base, no solo a los del mismo manifiesto.

### 11.2 Temas abiertos (no bloquean la fase 1)

- **Visor de tiras**: el formato `dzi` se consume en la fase 3 (por ejemplo, con OpenSeadragon); se confirma ahí.
- **Detalle de la integración con Hugging Face** (quién la dispara: la app de PC o un proceso programado; cómo recibe las imágenes): se define en la fase 2. El contrato de esta fase ya la admite.
- **Salto a la nube**: plan de pago, límite por archivo, alinear migraciones y unificar el admin (`ADMIN_EMAILS` → roles en la base).

### 11.3 Resueltos

- Llaves de Supabase expuestas en la carpeta `EXIF/` de VND: atendidas por el dueño (11/11/2026).

---

## 12. Cambios durante la implementación

Verificado el 15/11/2026 en local (`db reset` + pgTAP 00–07, vitest, typecheck, build y pytest en verde). Lo que cambió respecto al diseño original:

- **§9.1 `seed-media`**: lo cubre `scripts/ingest_demo`. Las fotos vienen de una carpeta que pasa el usuario con `--folder` (`EXIF/` no trae fotos de muestra). exiftool se resuelve con `--exiftool`, luego `NEXUS_EXIFTOOL`, luego el PATH.
- **§8.3 códigos de error**: la lista final tiene 14 códigos y vive en `INGEST_ERROR_CODES` de `src/contracts/ingest-manifest.ts`: `unsupported_version`, `forbidden_project`, `inspection_locked`, `asset_other_org`, `empty_manifest`, `bad_path`, `missing_object`, `unknown_finding_type`, `unknown_capture`, `unknown_mosaic`, `duplicate_sha256`, `duplicate_id`, `foreign_id`, `finding_target_changed`. La regla de `corrected_at` (no sobrescribir) también aplica a los daños manuales, no solo a los de IA.
- **§3/§4 asignaciones**: una asignación solo da acceso mientras `platform_role` sea `technician` o `service`; bajar de rol a alguien borra sus asignaciones.
- **§3/§4 integridad**: los ids padre son inmutables en `captures`, `findings`, `comments` y `mosaics`; la captura emparejada (RGB/térmica) debe ser de la misma inspección.
- **`supabase/config.toml`**: `[auth.email] enable_signup = true` es necesario para el acceso con contraseña; `[auth] enable_signup = false` bloquea el registro abierto.
- **Pendiente**: la corrida de `ingest_demo` con fotos reales de dron; hasta ahora se probó con JPEG sintéticos con etiquetas DJI (6 capturas, 18 objetos en Storage con ruta `{org}/{project}/{inspection}/captures/{id}/…`, segunda corrida idempotente).
