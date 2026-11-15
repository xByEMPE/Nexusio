# Inspecciones NEXUS · Fase 3: pala completa y visor de palas

Fecha: 15/11/2026 · Estado: borrador para revisión · Parte de: plataforma de inspecciones (fase 1 en `docs/superpowers/specs/2026-11-11-inspecciones-fase1-base-design.md`)

---

## 1. Propósito y alcance

### 1.1 Qué se busca

Ver una inspección de palas en el navegador y trabajarla sin otra herramienta:

- **Pala completa**: las 4 caras de cada pala reconstruidas, como estado general visual.
- **Visor de fotos**: recorrer las fotos de cada cara, medir con la regla virtual, ver, crear y corregir daños, comentar, revisar como cliente y ver fotos térmicas.
- **Mapa del parque** (§9): cada turbina en su posición real (tomada de la foto `_ID`), con vista sencilla o satélite y filtros por estado y severidad.

**Éxito:** con la inspección real WTG 25 cargada en local, el personal de NEXUS recorre las 3 palas, mide, marca y confirma daños; el cliente ve solo los daños confirmados de la inspección aprobada, los comenta y los marca como revisados.

### 1.2 Decisiones del dueño del producto

| Decisión | Detalle |
|---|---|
| Pala completa **solo visual** | Las tiras unidas no llevan marcas, medidas ni clics. Dan el estado general |
| Herramientas de la fase | Regla y medición; daños (marcar y corregir); comentarios y revisión; visor térmico |
| Radio y GSD por foto, por ahora | Se leen de los `manifest_*.json` que genera la app de VND hasta que exista la app de PC (fase 2) |
| Enfoque técnico | Visor propio en React (enfoque A), sin librerías de visor pesadas |
| **Un solo lenguaje** | Toda la plataforma en TypeScript. La app de PC (fase 2) también será TypeScript (Electron o Tauri con `onnxruntime-node`, `exiftool-vendored`, `sharp`, `tus-js-client`). El script de Python de la fase 1 es temporal |

### 1.3 Fuera de la fase 3

Detección con Hugging Face, app de PC, reportes PDF, calibración de tiras, plantas solares, líneas de transmisión, nubes de puntos y edición de daños desde celular (en celular solo se ve).

### 1.4 Reglas de trabajo

- Todo en local (Supabase en Docker). Nada contra el proyecto de producción `swedqyjhepghtwrmzlth`.
- Rama local `inspecciones-fase3` (worktree `.worktrees/fase3`), que parte de `inspecciones-fase1`. Commits locales permitidos; **sin push ni fusión a `main` sin confirmación**.
- Las fotos de clientes (`WTG*/`) nunca se versionan.

---

## 2. Datos y carga

### 2.1 Datos reales disponibles (WTG 25)

| Contenido | Cantidad | Destino |
|---|---|---|
| Fotos `Blade {A,B,C}/{LE,PS,SS,TE}/*.JPG` | 212 | `captures` + `blade_captures` (ya cargadas en local) |
| Tiras `25_img_stitched/25_{A,B,C}_{LeadingEdge,PressureSide,SuctionSide,TrailingEdge}.jpeg` | 12 (≈ 900–1 270 × 4 700–6 300 px, < 1 MB) | `mosaics` |
| `manifest_{A,B,C}.json` (app de VND) | 3 | radio y GSD por foto, largo de pala |

Largo de pala de la WTG 25: **37 m** (`bladeInfo.length = 37000` mm).

### 2.2 Lectura de los manifiestos (herramienta temporal)

Cambio mínimo en `scripts/ingest_demo` (Python, temporal; no se le agrega nada más):

| Manifiesto (por foto, `images[].id` = nombre de archivo) | Destino |
|---|---|
| `computed.radius` (mm) | `blade_captures.radius_center_m` = valor / 1000 |
| `computed.gsd` (mm/px) | `captures.gsd_mm_px` **solo si la foto no tiene GSD por láser**, con `gsd_source = 'manual'`, `gsd_confidence = 'low'` |
| `metadata.sequence_direction` | `blade_captures.sequence_direction` (`RootToTip` → `root_to_tip`, `TipToRoot` → `tip_to_root`) |
| `bladeInfo.length` (mm) | `inspections.blade_length_m` = valor / 1000 |

Si una foto no aparece en el manifiesto, se deja como está. Si el manifiesto no existe, el script funciona igual que hoy.

### 2.3 Tiras de pala completa

- Cada imagen de `*_img_stitched/` se sube como `mosaics` con `kind = 'blade_strip'`, `spectrum = 'rgb'`, `format = 'image'`, pala y cara tomadas del nombre (`LeadingEdge` → `LE`, `PressureSide` → `PS`, `SuctionSide` → `SS`, `TrailingEdge` → `TE`).
- Se generan `strip.webp` (calidad 85, sin reducir si el lado mayor ≤ 8 000 px) y `thumb.webp` (lado mayor 400 px).
- Ruta: `{org}/{project}/{inspection}/mosaics/{mosaic_id}/strip.webp` y `…/thumb.webp`.
- Sin calibración (§1.2): las columnas de calibración quedan nulas.

### 2.4 Foto térmica de prueba

La WTG 25 es solo RGB. Un script en **TypeScript** (`scripts/thermal-demo.ts`, ejecutado con `tsx`, librería `fast-png`) genera:

- `thermal.png`: matriz de 16 bits de 640 × 512, con fondo a 25 °C y un punto caliente de 68 °C, codificada con `temp_scale = 0.01` y `temp_offset = -100` (§5.4 de la fase 1);
- una vista RGB falsa (paleta hierro) como `original.jpg`/`preview.webp`/`thumb.webp`.

Se sube como una captura `spectrum = 'thermal'` con su fila en `thermal_captures`, **pareada** (`paired_capture_id`) con una foto RGB de la WTG 25, y entra por `ingest_manifest`.

### 2.5 Fórmulas compartidas (`src/lib/blade/`)

Funciones puras en TypeScript, con pruebas, que usarán el portal y la futura app de PC. Notación de §4 del documento de VND (`material/FRONTEND_MEDICION_Y_VISORES.md`): `g` = GSD en mm/px, `g_m = g/1000`, `r_c` = radio al centro de la foto (m), `H` = alto de la imagen (px), `z` = zoom, `p` = desplazamiento, `θ` = rotación.

| Módulo | Función | Contenido |
|---|---|---|
| `radius.ts` | `radiusAtRow(y, { rc_m, gsd_mm_px, height_px, tipAtTop })` | `r(y) = r_c − s·(y − H/2)·g_m`, con `s = +1` si la punta está arriba y `−1` si no |
| `transform.ts` | `screenToImage(pt, view)`, `imageToScreen(pt, view)` | Fórmula de §4.2 (traslación, escala, rotación con origen al centro) y su inversa |
| `ruler.ts` | `rulerStep(zoom, gsd_mm_px)`, `rulerTicks(view, calib)` | Paso 1·2·5·10 para ≈ 80 px entre marcas (§4.3); marcas visibles en `[−50, H_c + 50]` |
| `measure.ts` | `polygonAreaMm2(points, gsd)`, `boxDimensionsMm(box, gsd)`, `findingMeasurements(region, capture)` | Cordón de zapatos (§4.5); ancho/alto de la caja envolvente; radio del centro de la región |
| `thermal.ts` | `decodeThermal(png16, scale, offset)`, `statsInRegion(matrix, region)`, `palette(name)` | Matriz `Float32Array` en °C; mín/máx/promedio en recuadro o línea; paletas `hierro`, `arcoiris`, `gris` |

### 2.6 Las 9 inconsistencias del documento de VND, resueltas

| # | Inconsistencia en VND | Regla en NEXUS |
|---|---|---|
| 1 | Al crear un daño, radio con signo invertido (`r_c + Δy·g`) | Una sola función `radiusAtRow` para regla, crosshair, daños y servidor |
| 2 | Regla y medidas usaban GSD distintos | Un solo GSD por foto: `captures.gsd_mm_px` |
| 3 | La regla nunca se dibujaba en `EditableImageViewer` | Un solo componente de visor; no hay modal aparte |
| 4 | GSD de respaldo distinto (1, 0.75, 0.0005) | Sin respaldo inventado: sin GSD no hay regla ni medidas (aviso «Esta foto no tiene escala») |
| 5 | Manifiesto descargado pero sin usar | El manifiesto solo se lee en la carga (§2.2), y sus valores quedan en columnas |
| 6 | El área cambiaba según la herramienta (bbox vs polígono) | Recuadro: ancho × alto; polígono: cordón de zapatos. Se guarda cuál es en `region.type` |
| 7 | `getGlobalY` ignoraba la rotación | El radio se calcula en coordenadas de **imagen** (tras `screenToImage`), no de pantalla |
| 8 | «Otras secciones» dividía siempre entre 1000 | Unidades en el nombre de la columna; no hay heurística de mm/m |
| 9 | Dos estrategias para ordenar imágenes | Un solo orden (§3.3) |

---

## 3. Pantallas y navegación

### 3.1 Rutas

| Admin (personal de NEXUS) | Portal (cliente) | Contenido |
|---|---|---|
| `/admin/inspecciones/proyectos/[id]/inspecciones/[inspectionId]` | `/portal/proyectos/[id]/inspecciones/[inspectionId]` | Pestañas: **Pala completa**, **Fotos** (cuadrícula actual), **Daños** (lista filtrable por pala, cara, severidad y estado) |
| `…/inspecciones/[inspectionId]/visor?foto=<capture_id>` | `/portal/…/inspecciones/[inspectionId]/visor?foto=<capture_id>` | Visor de fotos |

Componentes compartidos en `src/components/inspections/viewer/`; cada entorno solo pasa los permisos (§4.6). Todas las rutas siguen detrás de `INSPECTIONS_ENABLED` y con `dynamic = "force-dynamic"`.

### 3.2 Pala completa

- Selector de pala A · B · C.
- Las 4 tiras lado a lado en orden **LE · PS · TE · SS**, misma altura, punta arriba, raíz abajo, etiqueta por cara.
- Zoom y desplazamiento **sincronizados** entre las 4.
- Si falta una cara, su hueco muestra «Sin reconstrucción».
- Sin marcas ni clics (§1.2).

### 3.3 Visor de fotos (3 columnas)

```
┌ Barra: archivo · pala/cara · ◀ ▶ · zoom · brillo/contraste · negativo ·
│        herramientas (mover · crosshair · medir área · nuevo daño) · regla · descargar original
├────────────────────────────────┬──────────────┬─────────────────────────┐
│ Visor (preview → original)     │ Modelo 2D de │ Otras caras: foto más   │
│  · regla en mm desde la raíz   │ la pala con  │   cercana por radio     │
│  · daños de la foto            │ daños por    │   (clic = vista doble)  │
│  · vista doble opcional        │ radio y      │ Panel del daño elegido  │
│                                │ severidad    │ Lista de daños de la    │
│                                │ (clic → foto)│   pala                  │
└────────────────────────────────┴──────────────┴─────────────────────────┘
```

- **Orden de fotos**: caras **TE → PS → LE → SS**; dentro de cada cara, radio descendente (punta → raíz). Sin radio, por `sequence_index`.
- **Teclado**: ← → foto anterior/siguiente; `+` `−` zoom; `0` ajustar; `Esc` cancela la herramienta.
- **Celular** (< `lg`): columna 3 como panel deslizable, columna 2 oculta, sin herramientas de edición.
- **Modelo 2D de la pala**: posición `y(r) = y_root − (r/L)·(y_root − y_tip)` (§4.6 de VND) con `L = inspections.blade_length_m`; marcadores con el color de severidad.
- **Brillo, contraste y negativo**: filtros CSS sobre la imagen; no afectan a la regla ni a las medidas.

### 3.4 Modo térmico

Si la foto es térmica o tiene una pareja térmica: selector **RGB / Térmico**. En térmico:

- se decodifica `thermal.png` con `fast-png` (el navegador por sí solo reduce el PNG a 8 bits);
- paleta `hierro` · `arcoiris` · `gris` y rango mín/máx ajustable, pintados en un `<canvas>`;
- temperatura bajo el cursor;
- herramientas recuadro y línea: mín, máx y promedio.

### 3.5 Carga de imágenes

- Al abrir el visor se firman en **una** llamada las URL de `preview.webp` de toda la inspección (`signPaths`, 1 h).
- `original.jpg` y `thermal.png` se firman bajo demanda: zoom mayor que la resolución de la vista previa, descarga o modo térmico.
- Se precargan la foto actual y sus 2 vecinas; la cuadrícula y el modelo usan `thumb.webp`.
- La capa SVG y la regla se redibujan sin recargar la imagen.

---

## 4. Medición, daños, comentarios y permisos

### 4.1 Regla y medición

- **Regla**: fuera de la capa transformada, tamaño fijo en pantalla, en mm desde la raíz (`round(r·1000)`). Requiere `gsd_mm_px` y `radius_center_m`.
- **Crosshair**: radio bajo el cursor (`R: 12 345 mm`).
- **Medir área**: polígono de 4 o más puntos; área (cordón de zapatos), ancho y alto en mm.
- Las mediciones son temporales: no se guardan salvo que se conviertan en daño.
- **Sin escala** (`gsd_mm_px` nulo): regla y medición ocultas, con el aviso «Esta foto no tiene escala». **Escala de confianza baja**: la regla muestra la etiqueta «escala estimada».
- Si falta `radius_center_m` pero hay GSD: se miden dimensiones y área, pero la regla y el crosshair no muestran radio.

### 4.2 Daños

- **Vista**: recuadro o polígono con el color de severidad (Cat 1 `#10B981`, Cat 2 `#84CC16`, Cat 3 `#F59E0B`, Cat 4 `#F97316`, Cat 5 `#EF4444`). Los `detected` (IA) con línea punteada.
- **Crear** (personal): recuadro o polígono → tipo (`finding_types` del dominio `wind_blade`), severidad 1–5, notas. `source = 'manual'`, `status = 'confirmed'`.
- **Editar** (personal): tipo, severidad, notas, mover vértices, confirmar o descartar.
- **Medidas**: el servidor las **recalcula** con `findingMeasurements` (§2.5) a partir de la región guardada y el GSD de la foto, y guarda `gsd_mm_px_used`. Los valores enviados por el navegador se ignoran.
- **Historial**: el personal ve un panel con los cambios del daño (`change_log`). `ai_original` se conserva.
- **Inspección aprobada**: solo el admin edita (regla de la fase 1).

### 4.3 Comentarios

- Hilo por daño y hilo por inspección (`comments`).
- Escriben el personal y el cliente responsable; el autor edita (marca «editado») o borra el suyo; el admin borra cualquiera.

### 4.4 Revisión del cliente

Botón **Marcar como revisado** en cada daño visible para el cliente responsable (`mark_finding_reviewed`). Se muestra quién y cuándo.

### 4.5 Qué ve el cliente

- Daños **solo** si la inspección está `approved` y el daño está `confirmed`.
- Mientras la inspección esté en revisión: fotos y pala completa con el aviso «En revisión por NEXUS», sin daños.
- La regla se aplica **en la base de datos** (§5.1), no solo en la pantalla.

### 4.6 Permisos

| Acción | Admin | Técnico asignado | Cliente responsable | Cliente lector |
|---|---|---|---|---|
| Ver fotos, pala completa, regla, medición, térmico | ✅ | ✅ | ✅ | ✅ |
| Crear/editar daños, confirmar o descartar | ✅ | ✅ (no si aprobada) | — | — |
| Borrar daños | ✅ | — | — | — |
| Comentar | ✅ | ✅ | ✅ (daños visibles e inspección) | — |
| Marcar como revisado | — | — | ✅ | — |
| Ver historial | ✅ | ✅ | — | — |

### 4.7 Acciones del servidor

`createFinding`, `updateFinding`, `setFindingStatus`, `deleteFinding` (solo admin), `addComment`, `editComment`, `deleteComment`, `markReviewed`. Todas:

- revisan `INSPECTIONS_ENABLED` y la sesión (`requireStaff` o `requireClient` según la acción);
- validan con Zod (`src/contracts/inspections-viewer.ts`);
- escriben con el cliente de sesión (RLS);
- devuelven `{ ok: true } | { ok: false; message }` con mensajes en español.

---

## 5. Base de datos

Una migración nueva: `supabase/migrations/20261115000100_inspections_viewer.sql`. No modifica las de la fase 1.

### 5.1 Visibilidad de daños para clientes

- `private.can_see_finding(p uuid, i uuid, status public.finding_status) returns boolean` (`security definer`, `search_path = ''`): verdadero si `private.is_staff() and private.can_read_project(p)`, o si el usuario es miembro de la organización del proyecto **y** la inspección está `approved` **y** `status = 'confirmed'`.
- Política `findings_select` → `private.can_see_finding(project_id, inspection_id, status)`.
- `comments`: un comentario con `finding_id` solo se ve y se crea si el daño es visible para ese usuario; los comentarios de inspección siguen como en la fase 1.
- `mark_finding_reviewed`: además exige que el daño sea visible (`not_allowed` si no).

### 5.2 Columnas de sistema protegidas

Trigger `before insert or update` en `findings`: cuando `auth.uid()` no es nulo y `current_setting('nexus.ingest', true) is distinct from 'on'`:

- en **insert**: `corrected_at`, `corrected_by`, `client_reviewed_at`, `client_reviewed_by` deben ser nulos; `created_by` se fuerza a `auth.uid()`; `source` debe ser `'manual'`; `ai_confidence`, `ai_model`, `ai_model_version`, `ai_original` deben ser nulos;
- en **update**: esas columnas no pueden cambiar (las de corrección las sigue poniendo su trigger; las de revisión, `mark_finding_reviewed`).

Violación: `P0001 'system_column'`.

---

## 6. Pruebas

### 6.1 Base de datos (pgTAP, `supabase/tests/09_viewer.test.sql`)

1. El cliente no ve daños `detected` ni `dismissed`, ni ninguno de una inspección no aprobada; sí ve los `confirmed` de una aprobada.
2. El cliente no comenta ni marca como revisado un daño que no ve.
3. El personal ve todos los daños de sus proyectos.
4. El personal no puede escribir `corrected_*`, `client_reviewed_*`, `created_by` ajeno, `source = 'ai'` ni `ai_*`; `ingest_manifest` sí.
5. Las 291 pruebas de la fase 1 siguen pasando.

### 6.2 Fórmulas y contratos (Vitest)

- `radiusAtRow` con punta arriba y raíz arriba; el centro de la foto devuelve `r_c`.
- `screenToImage` ∘ `imageToScreen` = identidad con zoom, desplazamiento y rotación.
- `rulerStep`: valores 1·2·5·10 × 10ⁿ y ≈ 80 px entre marcas.
- `polygonAreaMm2` de un cuadrado y de un triángulo conocidos.
- `boxDimensionsMm` y `findingMeasurements` (radio del centro de la región).
- `decodeThermal`: valor 12 500 → 25.00 °C; 16 800 → 68.00 °C.
- Un caso por cada inconsistencia de §2.6.
- Esquemas Zod de las acciones (válidos e inválidos).

### 6.3 Punta a punta en el navegador (WTG 25, local)

1. Pala completa: las 4 tiras de cada pala, zoom sincronizado.
2. Visor: recorrer con el teclado; la regla de una foto con láser marca valores coherentes con su GSD.
3. Medir un área; crear un daño, corregir su severidad, confirmarlo y comentarlo.
4. Aprobar la inspección.
5. Como `gerente@cliente-a.local`: ve solo el daño confirmado, lo comenta y lo marca como revisado. Como `gerente@cliente-b.local`: 404.
6. Foto térmica de prueba: paleta, temperatura bajo el cursor y estadísticas del recuadro (máx ≈ 68 °C).

---

## 7. Archivos

| Ruta | Responsabilidad |
|---|---|
| `src/lib/blade/{radius,transform,ruler,measure,thermal}.ts` (+ `.test.ts`) | Fórmulas compartidas |
| `src/contracts/inspections-viewer.ts` (+ `.test.ts`) | Esquemas Zod de las acciones del visor |
| `src/services/inspections/viewer-data.ts` | Consulta de inspección, fotos, daños, tiras y firmas |
| `src/components/inspections/viewer/*` | Pala completa, visor, capa SVG, regla, modelo 2D, paneles, térmico |
| `src/app/admin/inspecciones/actions/findings.ts`, `comments.ts` | Acciones del personal |
| `src/app/portal/actions/*.ts` | Acciones del cliente (comentar, revisar) |
| Rutas de §3.1 (admin y portal) | Páginas |
| `supabase/migrations/20261115000100_inspections_viewer.sql` | §5 |
| `supabase/tests/09_viewer.test.sql` | §6.1 |
| `scripts/ingest_demo/` (cambio mínimo) | §2.2 y §2.3 |
| `scripts/thermal-demo.ts` | §2.4 |

Dependencias nuevas: `fast-png` (decodificar y generar PNG de 16 bits), `tsx` (ejecutar scripts TypeScript, solo desarrollo).

---

## 8. Decisiones y temas abiertos

| Decisión | Motivo |
|---|---|
| Tira de pala completa solo visual | Decisión del dueño; las fotos originales son la referencia de detalle |
| Radio/GSD desde los manifiestos de VND, temporal | Probar el visor con datos reales sin esperar la fase 2 |
| Visor propio en React | Control total de la regla y de las fórmulas; sin mosaicos de cuadros |
| Medidas recalculadas en el servidor | Nadie puede guardar una medida inventada |
| Cliente ve solo daños confirmados de inspecciones aprobadas, en la base de datos | No llegan detecciones de IA sin revisar |
| TypeScript para todo lo nuevo | Un solo lenguaje en la plataforma |

---

## 9. Mapa del parque

### 9.1 Posición de cada turbina

- **Fuente**: la foto de la carpeta con terminación `_ID` de la inspección (por ejemplo `WTG 25/DJI_202604291354_001_ID/DJI_…_V_P-….JPG`). Se toma a la altura de la base y el láser apunta a la torre.
- **Regla**: si `LRFStatus = Normal`, `LRFTargetDistance > 0` y `LRFTargetLat/Lon` no son 0 → posición = punto del láser (`source = 'lrf_target'`). Si no → GPS del dron en esa foto (`source = 'gps'`). Sin foto `_ID` → sin posición.
- WTG 25: láser a 8.244 m → **16.5636472, −94.7367278** (GPS del dron: 16.5636554, −94.7366548).
- **Dónde se guarda**: columnas nuevas en `inspections`: `asset_lat`, `asset_lon` (`double precision` con `check` de rango) y `asset_position_source` (`'lrf_target' | 'gps'`). El técnico puede escribirlas (RLS de inspecciones); `assets.lat/lon` siguen siendo del admin.
- **Posición mostrada en el mapa**: `assets.lat/lon` si existen; si no, la de la inspección más reciente con posición. En la ficha del activo, el admin tiene «Usar posición de la última inspección» (rellena `assets.lat/lon` con la acción existente `upsertAsset`).
- **Foto `_ID`**: se sube también como captura (sin datos de pala) y se registra en `inspections.id_capture_id`; aparece en la ventana de la turbina en el mapa.
- **Carga temporal**: el script `ingest_demo` detecta la carpeta `*_ID`, calcula la posición con la regla de arriba y la escribe en la inspección con la sesión del técnico después de `ingest_manifest`. La app de PC (fase 2) hará lo mismo.

### 9.2 Mapa

| Pieza | Elección |
|---|---|
| Motor | **MapLibre GL JS** (código abierto, sin costo) |
| Vista «Sencilla» (por defecto) | Teselas vectoriales de **OpenFreeMap** (gratis, sin llave, sin límite de visitas) con un estilo propio **NEXUS oscuro** (fondo azul marino, agua y caminos tenues, etiquetas claras), en `src/components/inspections/map/nexus-style.ts` |
| Vista «Satélite» | **Esri World Imagery** con la llave gratuita de ArcGIS Location Platform en `NEXT_PUBLIC_ESRI_API_KEY`; sin llave, el botón Satélite no aparece |
| Atribución | Visible siempre (OpenStreetMap/OpenFreeMap; Esri y sus proveedores en satélite) |

**Pantallas**:
- Admin: pestaña **Mapa** en el detalle del sitio (`/admin/inspecciones/sitios/[id]?tab=mapa`) y mapa por proyecto en el detalle del proyecto.
- Portal: mapa en la página de cada proyecto (`/portal/proyectos/[id]`) con los parques del proyecto.

**Contenido**:
- Cada turbina como punto con su nombre, en su posición real; encuadre automático a todas las turbinas del sitio o proyecto.
- **Color por estado**: sin inspección (gris), pendiente/en campo/procesando (azul), en revisión (ámbar), aprobada sin daños visibles (verde), aprobada con daños → color de la severidad máxima visible (Cat 1–5).
- **Filtros**: vista Sencilla/Satélite, estado de inspección y severidad mínima.
- **Interacción**: al pasar el cursor, nombre y estado; al hacer clic, ventana con la miniatura de la foto `_ID`, estado, número de daños por severidad y enlace a la inspección (pala completa).
- Las mismas reglas de visibilidad: el cliente solo ve sus proyectos y, en el color, solo daños visibles para él (§4.5).
- Sin coordenadas: la turbina aparece en una lista «Sin posición» debajo del mapa.

**Carga**: MapLibre se importa de forma dinámica solo en la página del mapa (no aumenta el peso del resto del portal).

### 9.3 Pruebas del mapa

- Vitest: `turbinePosition(exif)` (láser válido, láser con error → GPS, sin datos → `null`) y `turbineColor(status, maxSeverity)`; `fitBounds` de una lista de puntos.
- pytest: detección de la carpeta `_ID` y regla de posición con un fixture con la estructura del EXIF de la WTG 25, pero con coordenadas ficticias (las reales del cliente no se versionan).
- pgTAP: el técnico asignado escribe `asset_lat/lon` de su inspección; el cliente no.
- Navegador: WTG-25 aparece en su posición; cambiar a satélite (si hay llave); filtros; clic abre la inspección; como cliente B no ve el parque de A.

---

**Temas abiertos (no bloquean la fase 3):**

- **Fase 2 (app de PC en TypeScript)**: estimar el GSD de fotos sin láser (por ejemplo interpolando entre vecinas), calcular el radio desde las marcas de raíz y punta, unir las tiras y llamar a Hugging Face. Generará por el mismo contrato los datos que hoy salen de los manifiestos.
- **Calibración de tiras**: no se necesita mientras sean solo visuales.
