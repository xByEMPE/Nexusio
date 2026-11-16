# Inspecciones NEXUS · Fase 3 (pala completa y visor) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vista de pala completa (solo visual), visor de fotos de palas con regla, medición, daños, comentarios, revisión del cliente y modo térmico, y mapa del parque con la posición real de cada turbina, probados con la inspección real WTG 25 en local.

**Architecture:** Fórmulas puras en `src/lib/blade/` (compartibles con la futura app de PC en TypeScript). Visor propio en React: imagen con transformaciones CSS y capa SVG encima. Datos por el cliente de sesión (RLS); acciones del servidor validadas con Zod que recalculan las medidas. Una migración nueva limita lo que ven los clientes y protege las columnas de sistema.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.9, Zod 4, Vitest, Supabase local (Postgres 17, pgTAP), `fast-png`, `tsx`; Python solo para el cambio mínimo del script temporal `scripts/ingest_demo`.

**Spec:** `docs/superpowers/specs/2026-11-15-inspecciones-fase3-visor-palas-design.md` (leerlo completo; §N se refiere a ese documento). Base de la fase 1: `docs/superpowers/specs/2026-11-11-inspecciones-fase1-base-design.md`. Fórmulas originales: `material/FRONTEND_MEDICION_Y_VISORES.md` en el repo principal (`C:/Users/airsc/Documents/NEXUS/material/`).

## Global Constraints

- Trabajo en la rama local `inspecciones-fase3` (worktree `C:/Users/airsc/Documents/NEXUS/.worktrees/fase3`). Commits locales con mensaje en español terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Nunca** push, fusión a `main`, `--linked` ni el proyecto de producción `swedqyjhepghtwrmzlth`.
- Todo lo nuevo en **TypeScript**. El script Python `scripts/ingest_demo` solo recibe el cambio de la Tarea 4.
- Fotos de clientes (`WTG*/`, en `C:/Users/airsc/Documents/NEXUS/WTG 25`) nunca se copian al repo.
- Rutas nuevas detrás de `INSPECTIONS_ENABLED` (`assertInspectionsEnabled()` en cada página y acción) y con `export const dynamic = "force-dynamic"`.
- Acciones del servidor: re-chequean flag y sesión, validan con Zod, escriben con el cliente de sesión, devuelven `{ ok: true } | { ok: false; message: string }` con mensajes en español (patrón de `src/lib/inspections/admin-action.ts`).
- Unidades en el nombre de variables y columnas (`_m`, `_mm`, `_px`, `_c`, `_mm2`). Sin heurísticas de mm/m.
- Colores de severidad: Cat 1 `#10B981`, Cat 2 `#84CC16`, Cat 3 `#F59E0B`, Cat 4 `#F97316`, Cat 5 `#EF4444`.
- Regiones de daños en coordenadas normalizadas 0–1 (`{type:"box",points:[[x0,y0],[x1,y1]]}` o `{type:"polygon",points:[…≥3]}`), igual que la fase 1.
- Antes de cada commit: `npm run test`, `npm run typecheck`; en tareas de base de datos además `npx supabase db reset && npx supabase test db`; en tareas de UI además `npm run build`. Servidores de desarrollo se detienen por su PID; borrar `AGENTS.md` si `next dev` lo genera.

## Review Focus

1. **Foto girada**: con rotación ≠ 0 la regla vertical ya no corresponde a filas de imagen; se oculta la regla y el crosshair sigue mostrando el radio correcto (calculado tras `screenToImage`). Prueba en Tarea 1 y verificación en Tarea 8.
2. **Foto sin GSD o sin radio**: el visor no debe mostrar una regla ni medidas inventadas (aviso «Esta foto no tiene escala»; con GSD pero sin radio, medidas sí, radio no). Pruebas en Tareas 1 y 6.
3. **Cliente abre por URL un daño oculto** (no confirmado, o inspección en revisión): la base no lo devuelve, no puede comentarlo ni marcarlo. Prueba en Tarea 3.
4. **Medidas enviadas desde el navegador**: el servidor las ignora y recalcula. Prueba en Tarea 6.
5. **PNG térmico de 16 bits**: se decodifica con `fast-png`, nunca vía `<img>`/canvas (que reduce a 8 bits). Prueba de valores exactos en Tarea 2.

---

## Mapa de archivos

| Ruta | Responsabilidad |
|---|---|
| `src/lib/blade/radius.ts`, `transform.ts`, `ruler.ts`, `measure.ts` (+ `.test.ts`) | Fórmulas de radio, pantalla↔imagen, regla, medidas |
| `src/lib/blade/thermal.ts` (+ `.test.ts`) | Decodificar matriz, estadísticas, paletas |
| `supabase/migrations/20261115000100_inspections_viewer.sql` | Visibilidad para clientes y columnas de sistema |
| `supabase/tests/09_viewer.test.sql` | Pruebas de la migración |
| `scripts/ingest_demo/ingest_demo/vnd_manifest.py`, `mosaics.py` (+ tests) | Lectura de manifiestos VND y subida de tiras (temporal) |
| `scripts/thermal-demo.ts` | Foto térmica sintética |
| `src/contracts/inspections-viewer.ts` (+ `.test.ts`) | Esquemas Zod de acciones del visor |
| `src/services/inspections/viewer-data.ts` | Carga de datos del visor |
| `src/lib/inspections/viewer-actions.ts` | Acciones del servidor del visor (personal y cliente) |
| `src/components/inspections/viewer/*` | Componentes del visor y pala completa |
| Páginas en `src/app/admin/inspecciones/proyectos/[id]/inspecciones/[inspectionId]/` y `src/app/portal/proyectos/[id]/inspecciones/[inspectionId]/` | Pestañas y visor |

---

### Task 1: Fórmulas de radio, transformación, regla y medidas

**Files:**
- Create: `src/lib/blade/radius.ts`, `transform.ts`, `ruler.ts`, `measure.ts`, `index.ts`
- Test: `src/lib/blade/radius.test.ts`, `transform.test.ts`, `ruler.test.ts`, `measure.test.ts`

**Interfaces:**
- Produces:
  - `type BladeFrame = { rc_m: number; gsd_mm_px: number; height_px: number; tipAtTop: boolean }`
  - `radiusAtRow(y_px: number, f: BladeFrame): number` (m) = `rc_m − s·(y_px − height_px/2)·gsd_mm_px/1000`, `s = tipAtTop ? 1 : −1`. `rowAtRadius(r_m, f): number` (inversa).
  - `type ViewState = { zoom: number; panX: number; panY: number; rotationDeg: number; containerW: number; containerH: number; imageW: number; imageH: number }`; `type Pt = { x: number; y: number }`
  - `screenToImage(p: Pt, v: ViewState): Pt`, `imageToScreen(p: Pt, v: ViewState): Pt` (§4.2 de VND, origen al centro del contenedor); `fitZoom(containerW, containerH, imageW, imageH): number` = `min(cW/iW, cH/iH, 1)·0.9`; `clampZoom(z)` a `[0.1, 10]`.
  - `rulerStep(zoom: number, gsd_mm_px: number): number` (m) con `t = (80/zoom)·g_m`, paso 1·2·5·10 × 10ⁿ (§4.3 VND).
  - `rulerTicks(v: ViewState, f: BladeFrame): { y: number; r_m: number; label: string }[]` — `[]` si `v.rotationDeg % 360 !== 0`; marcas en `[−50, containerH+50]`; `label = String(Math.round(r_m·1000))`.
  - `type Region = { type: "box"; points: [[number, number], [number, number]] } | { type: "polygon"; points: [number, number][] }` (normalizado 0–1).
  - `polygonAreaPx(points: Pt[]): number` (cordón de zapatos); `findingMeasurements(region: Region, cap: { width_px: number; height_px: number; gsd_mm_px: number | null; rc_m: number | null; tipAtTop: boolean }): { width_mm: number | null; length_mm: number | null; area_mm2: number | null; radius_m: number | null }` — ancho/largo = extensión de la caja envolvente en px × GSD; área: box = ancho×largo, polygon = cordón × GSD²; `radius_m` = `radiusAtRow(y del centro de la caja)` redondeado a 2 decimales y mínimo 0; todo `null` si falta el dato necesario.

- [ ] **Step 1: Escribir las pruebas** (valores exactos):

```ts
const f = { rc_m: 10, gsd_mm_px: 1, height_px: 3000, tipAtTop: true };
expect(radiusAtRow(1500, f)).toBeCloseTo(10);          // centro = r_c
expect(radiusAtRow(500, f)).toBeCloseTo(11);           // arriba = hacia la punta (inconsistencia #1)
expect(radiusAtRow(500, { ...f, tipAtTop: false })).toBeCloseTo(9);
expect(rowAtRadius(radiusAtRow(123, f), f)).toBeCloseTo(123);
// identidad con zoom, pan y rotación
const v = { zoom: 2, panX: 30, panY: -15, rotationDeg: 37, containerW: 800, containerH: 600, imageW: 5280, imageH: 3956 };
const p = { x: 1234, y: 567 }; const q = screenToImage(imageToScreen(p, v), v);
expect(q.x).toBeCloseTo(p.x); expect(q.y).toBeCloseTo(p.y);
expect(fitZoom(800, 600, 5280, 3956)).toBeCloseTo(Math.min(800 / 5280, 600 / 3956) * 0.9);
expect(rulerStep(1, 1)).toBeCloseTo(0.1);              // t = 0.08 m -> paso 0.1
expect(rulerTicks({ ...v, rotationDeg: 90 }, f)).toEqual([]);   // inconsistencia #7
expect(polygonAreaPx([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}])).toBe(100);
const cap = { width_px: 1000, height_px: 1000, gsd_mm_px: 2, rc_m: 5, tipAtTop: true };
expect(findingMeasurements({ type: "box", points: [[0.1, 0.1], [0.3, 0.2]] }, cap))
  .toEqual({ width_mm: 400, length_mm: 200, area_mm2: 80000, radius_m: 5.7 }); // centro y=150 px: 5 − (150−500)·2/1000
expect(findingMeasurements({ type: "polygon", points: [[0,0],[0.1,0],[0,0.1]] }, cap).area_mm2).toBeCloseTo(20000); // ½·100·100 px² · 4
expect(findingMeasurements({ type: "box", points: [[0,0],[0.1,0.1]] }, { ...cap, gsd_mm_px: null }))
  .toEqual({ width_mm: null, length_mm: null, area_mm2: null, radius_m: null });          // inconsistencia #4
expect(findingMeasurements({ type: "box", points: [[0,0],[0.1,0.1]] }, { ...cap, rc_m: null }).radius_m).toBeNull();
```

  Agregar en `measure.test.ts` un `describe("inconsistencias VND")` con un `it` por cada fila de §2.6 que tenga comportamiento comprobable aquí (#1, #4, #6, #7, #8: un valor de radio `> 200` se trata como metros, sin conversión).
- [ ] **Step 2:** Run `npm run test -- src/lib/blade` → Expected: FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar los cuatro módulos y `index.ts` (reexporta todo).
- [ ] **Step 4:** Run `npm run test -- src/lib/blade` → PASS; `npm run typecheck` limpio.
- [ ] **Step 5:** Commit.

---

### Task 2: Matriz térmica

**Files:**
- Modify: `package.json` (dependencia `fast-png`)
- Create: `src/lib/blade/thermal.ts`; Modify: `src/lib/blade/index.ts`
- Test: `src/lib/blade/thermal.test.ts`

**Interfaces:**
- Produces:
  - `type ThermalMatrix = { width: number; height: number; data: Float32Array }` (°C, fila mayor)
  - `decodeThermal(png: Uint8Array, scale: number, offset: number): ThermalMatrix` — `fast-png` `decode`; exige 1 canal de 16 bits (si no, lanza `Error("thermal_png_invalid")`); `°C = valor·scale + offset`.
  - `encodeThermal(m: ThermalMatrix, scale: number, offset: number): Uint8Array` (para el script de la Tarea 5 y las pruebas).
  - `statsInBox(m, box: { x0: number; y0: number; x1: number; y1: number }): { min_c: number; max_c: number; avg_c: number }` (px de la matriz, inclusivo, recortado a los bordes); `statsOnLine(m, a: Pt, b: Pt)` (muestreo Bresenham).
  - `type PaletteName = "hierro" | "arcoiris" | "gris"`; `paletteColor(name, t: number): [number, number, number]` (t en [0,1], recortado).
  - `renderThermal(m, name: PaletteName, min_c: number, max_c: number): Uint8ClampedArray` (RGBA, lista para `ImageData`).

- [ ] **Step 1: Pruebas**: una matriz 4×4 a 25 °C con un píxel a 68 °C; `encodeThermal` → `decodeThermal` con `scale 0.01, offset -100` devuelve exactamente 25 y 68 (valores crudos 12500 y 16800); `statsInBox` de toda la matriz → `{min_c:25, max_c:68}` y promedio exacto; un PNG RGB de 8 bits → lanza `thermal_png_invalid`; `paletteColor("gris", 0)` = `[0,0,0]`, `("gris",1)` = `[255,255,255]`; `renderThermal` tiene longitud `w·h·4`.
- [ ] **Step 2:** FAIL → **Step 3:** `npm i fast-png` e implementar → **Step 4:** PASS + typecheck → **Step 5:** Commit.

---

### Task 3: Migración de visibilidad y columnas de sistema

**Files:**
- Create: `supabase/migrations/20261115000100_inspections_viewer.sql`
- Test: `supabase/tests/09_viewer.test.sql` (usa `\ir helpers.psql`, `tests.make_world()`, `tests.affected()`)

**Interfaces:**
- Produces (SQL):
  - `private.can_see_finding(p uuid, i uuid, s public.finding_status) returns boolean` (`stable`, `security definer`, `set search_path = ''`): `(private.is_staff() and private.can_read_project(p))` **o** `(private.is_org_member(private.org_of_project(p)) and exists inspección i en p con status 'approved' and s = 'confirmed')`; todo con perfil activo.
  - `findings_select` reemplazada por `using (private.can_see_finding(project_id, inspection_id, status))`.
  - `comments_select` y `comments_insert`: si `finding_id` no es nulo, además exigen que el daño sea visible (`exists (select 1 from public.findings f where f.id = finding_id)` evaluado bajo RLS, o `can_see_finding` con los campos del daño).
  - `public.mark_finding_reviewed` redefinida: además de lo actual, `not_allowed` si el daño no es visible.
  - Trigger `findings_guard_system_columns` (`before insert or update`, función `security definer`) según §5.2 → `P0001 'system_column'`. Se omite cuando `auth.uid()` es nulo o `current_setting('nexus.ingest', true) = 'on'`; la función `mark_finding_reviewed` marca su transacción con `set_config('nexus.review','on',true)` y el trigger la deja tocar solo `client_reviewed_*`.

- [ ] **Step 1: Escribir `09_viewer.test.sql`** (errcodes fijos):
  - En `inspection_a` (en revisión) con un daño `confirmed` y otro `detected`: `mgr_a` ve 0 daños; tras aprobar (como postgres), `mgr_a` ve solo el `confirmed`; `viewer_a` igual.
  - `mgr_a` no puede comentar el `detected` (42501) ni `mark_finding_reviewed` sobre él (`P0001`); sí sobre el `confirmed`.
  - `tech_a` ve los dos daños en ambos estados.
  - `tech_a` insertando con `corrected_at` → `P0001`; con `source='ai'` → `P0001`; con `created_by` de otro → se guarda `auth.uid()` (el trigger lo fuerza, §5.2); update de `ai_original`/`client_reviewed_at` → `P0001`.
  - `ingest_manifest` de la fase 1 sigue pudiendo insertar daños de IA (manifiesto de solo daños como `service_a`).
  - `mark_finding_reviewed` sigue funcionando para `mgr_a` y llena `client_reviewed_*`.
- [ ] **Step 2:** Run `npx supabase db reset && npx supabase test db` → FAIL en 09.
- [ ] **Step 3:** Escribir la migración.
- [ ] **Step 4:** Run → 00–09 en `ok` (las 291 de la fase 1 siguen pasando).
- [ ] **Step 5:** `npm run db:types` (si cambian tipos) y commit.

---

### Task 4: Manifiestos de VND y tiras en el script temporal

**Files:**
- Create: `scripts/ingest_demo/ingest_demo/vnd_manifest.py`, `scripts/ingest_demo/ingest_demo/mosaics.py`
- Modify: `scripts/ingest_demo/ingest_demo/cli.py`, `scripts/ingest_demo/README.md`
- Test: `scripts/ingest_demo/tests/test_vnd_manifest.py`, `tests/test_mosaics.py`

**Interfaces:**
- `vnd_manifest.load(folder: Path) -> dict[str, VndPhoto]` (clave = nombre de archivo), con `VndPhoto(radius_m: float | None, gsd_mm_px: float | None, sequence_direction: Literal["root_to_tip","tip_to_root"] | None)`, leyendo `manifest_{A,B,C}.json` (`images[].id`, `computed.radius` mm → m, `computed.gsd`, `metadata.sequence_direction`); `vnd_manifest.blade_length_m(folder) -> float | None` (`bladeInfo.length`/1000; si difieren entre palas, el primero y un aviso impreso).
- `cli.build_capture` aplica §2.2: `radius_center_m`, `sequence_direction`; si `gsd` es `None` y hay `computed.gsd` → `{"mm_px": …, "source": "manual", "confidence": "low"}`.
- `mosaics.scan(folder: Path) -> list[StripFile]` sobre `*_img_stitched/*` con nombre `<x>_<A|B|C>_<LeadingEdge|PressureSide|SuctionSide|TrailingEdge>.<ext>` → `StripFile(path, blade, face)`; `mosaics.build_mosaic(strip, mosaic_id, prefix, width_px, height_px) -> dict` (formato del `MosaicSchema` de `src/contracts/ingest-manifest.ts`: `kind "blade_strip"`, `spectrum "rgb"`, `format "image"`, `path …/mosaics/{id}/strip.webp`, sin `calibration`).
- Ruling de este plan: solo se sube `strip.webp` (calidad 85, sin reducir si el lado mayor ≤ 8000 px); el esquema de `mosaics` guarda una sola ruta, así que no se genera `thumb.webp` (las tiras pesan < 1 MB).
- Los ids de mosaicos se guardan en el índice local por nombre de archivo (idempotencia).

- [ ] **Step 1: Pruebas** con un manifiesto mínimo escrito en `tmp_path` (2 imágenes, una con `radius: 1270.09` → `1.27009` m) y con nombres de tira válidos e inválidos (`25_D_LeadingEdge.jpeg` se ignora con aviso).
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** `.venv/Scripts/pytest -q` PASS.
- [ ] **Step 5: Corrida real**: con las variables de la README (`NEXUS_PUBLISHABLE_KEY`, `NEXUS_PASSWORD`, `NEXUS_EXIFTOOL`), `--folder "C:/Users/airsc/Documents/NEXUS/WTG 25"` sobre la inspección WTG-25 existente (asset `WTG-25` del Cliente A; consultar su id y el del proyecto con SQL local). Expected: `updated.captures = 212`, `inserted.mosaics = 12`; SQL: 212 fotos con `radius_center_m`, 0 sin GSD, `inspections.blade_length_m = 37`.
- [ ] **Step 6:** Commit.

---

### Task 5: Foto térmica de prueba

**Files:**
- Modify: `package.json` (devDependency `tsx`; script `"thermal-demo": "tsx scripts/thermal-demo.ts"`)
- Create: `scripts/thermal-demo.ts`

**Interfaces:**
- Consumes: `encodeThermal`, `renderThermal`, `paletteColor` (Tarea 2); `IngestManifestSchema` (fase 1).
- CLI: `npm run thermal-demo -- --project <uuid> --inspection <uuid> --pair <capture_id_rgb> --email tecnico@nexus.local` (contraseña en `NEXUS_PASSWORD`, URL/llave en `NEXUS_SUPABASE_URL`/`NEXUS_PUBLISHABLE_KEY`).
- Genera matriz 640×512 a 25 °C con disco caliente de radio 20 px a 68 °C en (400, 260); `thermal.png` (16 bits, `scale 0.01`, `offset -100`), `original.jpg`, `preview.webp`, `thumb.webp` (paleta hierro, con `sharp` si ya está disponible por Next; si no, `fast-png` + PNG y `contentType` correspondiente).
- Sube con la sesión del técnico a `{org}/{project}/{inspection}/captures/{id}/…` (Storage API estándar; archivos pequeños) y llama `rpc("ingest_manifest")` con una captura `spectrum "thermal"`, `paired_capture_id = --pair`, bloque `blade` copiado de la foto pareada y bloque `thermal` (`matrix_path`, `temp_scale`, `temp_offset`, `t_min_c 25`, `t_max_c 68`, `emissivity 0.95`).
- Idempotente: id fijo derivado de `--pair` (UUID v5 con espacio fijo documentado en el script).

- [ ] **Step 1:** Prueba Vitest `scripts/thermal-demo.test.ts` de la función pura `buildThermalMatrix()` (máximo 68, mínimo 25, píxel central del disco 68).
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS; corrida real contra la WTG 25 (pareada con la primera foto de `Blade A/LE`); SQL confirma la fila en `thermal_captures` y el par.
- [ ] **Step 5:** Commit.

---

### Task 6: Contratos, datos y acciones del visor

**Files:**
- Create: `src/contracts/inspections-viewer.ts` (+ `.test.ts`)
- Create: `src/services/inspections/viewer-data.ts`
- Create: `src/lib/inspections/viewer-actions.ts` (`"use server"`) (+ `src/lib/inspections/viewer-actions.test.ts` para la lógica pura extraída)

**Interfaces:**
- Zod:
  - `RegionInputSchema` (igual a `Region` de la Tarea 1, puntos en [0,1], box exactamente 2, polygon ≥ 3).
  - `FindingCreateSchema { inspection_id: uuid, capture_id: uuid, type_id: uuid, severity: int 1..5, region: RegionInputSchema, notes?: string ≤ 2000 }`
  - `FindingUpdateSchema { id: uuid, type_id?: uuid, severity?: 1..5, region?: RegionInputSchema, notes?: string ≤ 2000 }` (al menos un campo)
  - `FindingStatusSchema { id: uuid, status: "confirmed" | "dismissed" }`
  - `CommentCreateSchema { inspection_id: uuid, finding_id?: uuid, body: string 1..4000 (trim) }`, `CommentEditSchema { id: uuid, body }`, `IdSchema { id: uuid }`
- `viewer-data.ts`:
  - `type ViewerCapture = { id; file_name; spectrum; blade: "A"|"B"|"C"|null; face: "TE"|"PS"|"LE"|"SS"|null; radius_center_m: number|null; gsd_mm_px: number|null; gsd_confidence: …|null; width_px; height_px; preview_path; thumb_path; original_path; paired_capture_id; thermal: { matrix_path; temp_scale; temp_offset; t_min_c; t_max_c } | null; sequence_index }`
  - `orderCaptures(c: ViewerCapture[]): ViewerCapture[]` (pura): caras TE→PS→LE→SS, radio descendente, sin radio por `sequence_index`.
  - `loadInspectionViewer(sb, projectId, inspectionId): Promise<{ inspection; captures: ViewerCapture[]; findings; findingTypes; mosaics; comments; previewUrls: Map<string,string>; thumbUrls: Map<string,string>; stripUrls: Map<string,string> } | null>` (null si RLS no devuelve la inspección → la página hace `notFound()`).
  - `signOne(sb, path): Promise<string | null>` para originales y matrices bajo demanda.
- Acciones (`viewer-actions.ts`), todas con `assertInspectionsEnabled()` y `getViewer()`:
  - personal (`requireStaff` semántica): `createFinding(fd)`, `updateFinding(fd)`, `setFindingStatus(fd)`; admin: `deleteFinding(fd)`.
  - personal y cliente responsable: `addComment(fd)`, `editComment(fd)`, `deleteComment(fd)`; cliente responsable: `markReviewed(fd)` (RPC `mark_finding_reviewed`).
  - `createFinding`/`updateFinding` leen la captura (GSD, tamaño, radio) con la sesión y guardan `findingMeasurements(...)` + `gsd_mm_px_used`; cualquier medida en el `FormData` se ignora. Nuevo daño: `source 'manual'`, `status 'confirmed'`.
  - `getOriginalUrl(captureId)` y `getThermalUrl(captureId)` → `{ ok: true; url } | { ok: false; message }`.

- [ ] **Step 1: Pruebas** Zod (válidos/inválidos: severidad 6, box con 3 puntos, punto 1.2, body vacío) y de `orderCaptures` (orden de caras y radio), y de una función pura `measurementsForSave(region, capture)` que demuestre que valores enviados se ignoran.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** `npm run test`, `npm run typecheck` → **Step 5:** Commit.

---

### Task 7: Pestañas de la inspección y pala completa

**Files:**
- Modify: `src/app/admin/inspecciones/proyectos/[id]/inspecciones/[inspectionId]/page.tsx`, `src/app/portal/proyectos/[id]/inspecciones/[inspectionId]/page.tsx`
- Create: `src/components/inspections/viewer/InspectionTabs.tsx`, `BladeOverview.tsx`, `FindingsTable.tsx`

**Interfaces:**
- Consumes: `loadInspectionViewer`, `CaptureGrid` (existente).
- `InspectionTabs` con `?tab=pala|fotos|danos` (por defecto `pala` si hay mosaicos, si no `fotos`).
- `BladeOverview({ strips: { blade; face; url; width_px; height_px }[] })` (client): selector A·B·C; 4 columnas LE·PS·TE·SS a la misma altura; zoom (rueda/botones) y desplazamiento compartidos por un solo estado; hueco «Sin reconstrucción» si falta una cara; sin clics sobre la imagen.
- `FindingsTable({ findings, captures, canEdit })`: filtros por pala, cara, severidad, estado; cada fila enlaza al visor `…/visor?foto=<capture_id>&dano=<finding_id>`.
- En la cuadrícula «Fotos», cada miniatura enlaza al visor.
- Portal: mismas pestañas; con inspección no aprobada, la pestaña Daños muestra «En revisión por NEXUS» (la base ya no devuelve daños).

- [ ] **Step 1:** Implementar; **Step 2:** `npm run typecheck && npm run build`.
- [ ] **Step 3: Verificación en navegador** (`npx next dev -p 3001` desde el worktree, usuario `admin@nexus.local`): WTG-25 → pestaña Pala completa muestra las 4 tiras de A, B y C con zoom sincronizado; Fotos enlaza al visor (404 hasta Tarea 8, aceptable).
- [ ] **Step 4:** Commit.

---

### Task 8: Núcleo del visor (imagen, regla, crosshair, medición)

**Files:**
- Create: `src/app/admin/inspecciones/proyectos/[id]/inspecciones/[inspectionId]/visor/page.tsx`, `src/app/portal/proyectos/[id]/inspecciones/[inspectionId]/visor/page.tsx`
- Create: `src/components/inspections/viewer/PhotoViewer.tsx` (contenedor y estado), `ImageStage.tsx`, `OverlayLayer.tsx`, `Ruler.tsx`, `Toolbar.tsx`, `useViewState.ts`

**Interfaces:**
- Consumes: Tarea 1 (`ViewState`, `screenToImage`, `fitZoom`, `rulerTicks`, `radiusAtRow`, `findingMeasurements`), `loadInspectionViewer`, `getOriginalUrl`.
- `useViewState(image: { w; h }, container: { w; h })` → `{ view: ViewState; zoomBy(f, at?); panBy(dx, dy); rotate(deg); fit(); }` (zoom con rueda centrado en el cursor; `clampZoom`).
- `PhotoViewer({ data, mode: "staff" | "client", capabilities: { editFindings; deleteFindings; comment; review; history } })`; foto actual por `?foto=`; ← → navegan según `orderCaptures` y actualizan la URL sin recargar; `+`/`−`/`0`/`Esc`.
- `ImageStage`: `<img>` con `preview` y cambio a `original` (vía `getOriginalUrl`) cuando `zoom · imageW_preview / imageW_original > 1`; filtros CSS brillo/contraste/negativo.
- `Ruler`: fuera de la capa transformada; oculto si falta GSD o radio, o si hay rotación; etiqueta «escala estimada» con confianza `low`; aviso «Esta foto no tiene escala» sin GSD.
- `OverlayLayer` (SVG en coordenadas de imagen): crosshair con `R: <mm> mm` (o solo coordenadas si no hay radio); herramienta Medir área (clics, doble clic cierra) mostrando área/ancho/alto.

- [ ] **Step 1:** Implementar; **Step 2:** `npm run typecheck && npm run build`.
- [ ] **Step 3: Verificación en navegador** con WTG-25: abrir una foto con láser; la regla muestra mm desde la raíz y sube hacia la punta; el crosshair coincide con la regla; medir un área; girar 90° oculta la regla y el crosshair sigue dando radio; una foto con GSD `manual` muestra «escala estimada»; teclado ← → recorre en el orden TE→PS→LE→SS. Probar en ancho de celular (375 px): sin herramientas de edición.
- [ ] **Step 4:** Commit.

---

### Task 9: Daños, modelo 2D, otras caras, comentarios, revisión e historial

**Files:**
- Create: `src/components/inspections/viewer/FindingShapes.tsx`, `FindingEditor.tsx`, `FindingPanel.tsx`, `FindingList.tsx`, `BladeModel2D.tsx`, `OtherFaces.tsx`, `CommentsThread.tsx`, `HistoryPanel.tsx`
- Modify: `PhotoViewer.tsx`, `Toolbar.tsx`

**Interfaces:**
- Consumes: acciones de la Tarea 6; `change_log` (lectura con la sesión; vacío para clientes por RLS).
- `FindingShapes`: recuadros/polígonos con color de severidad; `detected` punteado; seleccionar abre el panel; con `?dano=` se selecciona al cargar.
- `FindingEditor` (solo `capabilities.editFindings`): herramienta «Nuevo daño» recuadro o polígono → formulario tipo/severidad/notas → `createFinding`; edición de vértices con asas → `updateFinding`; botones Confirmar/Descartar → `setFindingStatus`; Borrar solo con `deleteFindings`.
- `BladeModel2D({ blade_length_m, findings, captures })`: SVG vertical, `y(r) = y_root − (r/L)·(y_root − y_tip)` con `r` = `findings.radius_m`; marcador por daño con su color; clic abre la foto del daño.
- `OtherFaces`: para cada otra cara, la foto con `min |radius − r_actual|` (miniatura); clic activa vista doble (dos `ImageStage` lado a lado, zoom propio).
- `CommentsThread({ inspectionId, findingId? })`: lista, agregar (si `comment`), editar/borrar los propios; muestra `author_name` y «editado».
- `FindingPanel`: datos del daño, medidas guardadas, «corregido por NEXUS el …» (`corrected_at`), revisión del cliente con botón «Marcar como revisado» (si `review`), comentarios, y `HistoryPanel` (si `history`).
- Celular: columna 3 como panel deslizable, columna 2 oculta.

- [ ] **Step 1:** Implementar; **Step 2:** `npm run typecheck && npm run build && npm run test`.
- [ ] **Step 3: Verificación en navegador**: como `tecnico@nexus.local` crear un daño recuadro y uno polígono en WTG-25, cambiar severidad (aparece en el historial y en el modelo 2D), confirmar, comentar; como `admin@nexus.local` aprobar la inspección (pestaña/página existente); como `gerente@cliente-a.local` ver solo el confirmado, comentar y marcar revisado; como `lector@cliente-a.local` sin botón de comentar; como `gerente@cliente-b.local` el visor de A responde 404.
- [ ] **Step 4:** Commit.

---

### Task 10: Modo térmico en el visor

**Files:**
- Create: `src/components/inspections/viewer/ThermalCanvas.tsx`, `ThermalControls.tsx`
- Modify: `PhotoViewer.tsx`, `Toolbar.tsx`

**Interfaces:**
- Consumes: `decodeThermal`, `renderThermal`, `statsInBox`, `statsOnLine`, `PaletteName` (Tarea 2); `getThermalUrl` (Tarea 6).
- Selector RGB/Térmico si la captura es térmica o tiene `paired_capture_id` térmica.
- `ThermalCanvas`: descarga la matriz (fetch → `Uint8Array` → `decodeThermal`, nunca `<img>`), pinta con `renderThermal` en un `<canvas>` del tamaño de la matriz, transformado con el mismo `ViewState`.
- `ThermalControls`: paleta hierro/arcoíris/gris; deslizadores mín/máx (por defecto `t_min_c`/`t_max_c`); temperatura bajo el cursor; herramientas recuadro y línea → mín/máx/promedio.

- [ ] **Step 1:** Implementar; **Step 2:** `npm run typecheck && npm run build`.
- [ ] **Step 3: Verificación en navegador**: foto pareada de la Tarea 5 → modo térmico; cursor sobre el disco ≈ 68 °C y fuera ≈ 25 °C; recuadro sobre el disco `max ≈ 68`; cambiar paleta y rango.
- [ ] **Step 4:** Commit.

---

### Task 11: Posición de cada turbina desde la foto `_ID`

**Files:**
- Create: `supabase/migrations/20261115000200_inspections_position.sql`; Test: `supabase/tests/10_position.test.sql`
- Create: `src/lib/blade/position.ts` (+ `.test.ts`)
- Create: `scripts/ingest_demo/ingest_demo/position.py`; Modify: `cli.py`, `README.md`; Test: `scripts/ingest_demo/tests/test_position.py` (+ fixture con coordenadas ficticias)

**Interfaces:**
- SQL: `alter table public.inspections add column asset_lat double precision check (asset_lat between -90 and 90), add column asset_lon double precision check (asset_lon between -180 and 180), add column asset_position_source text check (asset_position_source in ('lrf_target','gps'))`; las tres juntas o ninguna (`check`). Sin políticas nuevas (las de update de inspecciones ya aplican). Regenerar `database.types.ts`.
- TS (para la futura app y el portal): `turbinePosition(exif: Record<string, unknown>): { lat: number; lon: number; source: "lrf_target" | "gps" } | null` con la regla de spec §9.1 (números como texto con signo aceptados).
- Python: `position.find_id_photo(folder: Path) -> Path | None` (primer `*.JPG` dentro de una subcarpeta cuyo nombre termina en `_ID`); `position.turbine_position(meta: dict) -> tuple[float, float, str] | None` (misma regla).
- `cli.py`: la foto `_ID` entra al manifiesto como captura RGB sin bloque `blade` y `inspection.id_capture_id` apunta a ella; después de `ingest_manifest`, `update inspections set asset_lat, asset_lon, asset_position_source` con la sesión del técnico.

- [ ] **Step 1: Pruebas**: Vitest y pytest con los mismos tres casos (láser `Normal` 8.244 m → `lrf_target`; `LRFStatus: "Error"` → `gps`; sin GPS ni láser → `null`); pgTAP: `tech_a` actualiza `asset_lat/lon` de `inspection_a`; `mgr_a` no (0 filas); valores fuera de rango → `23514`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** `npx supabase db reset && npx supabase test db`, `npm run test`, `.venv/Scripts/pytest -q` PASS.
- [ ] **Step 5: Corrida real** WTG 25: la inspección queda con `asset_lat`/`asset_lon` ≈ coordenadas reales de la WTG 25 (no se versionan), `source = 'lrf_target'` e `id_capture_id` de la foto `_ID`.
- [ ] **Step 6:** Commit.

---

### Task 12: Mapa del parque (MapLibre + OpenFreeMap)

**Files:**
- Modify: `package.json` (dependencia `maplibre-gl`)
- Create: `src/components/inspections/map/nexus-style.ts`, `ParkMap.tsx` (client, importado con `next/dynamic` `ssr:false`), `MapFilters.tsx`, `TurbinePopup.tsx`
- Create: `src/lib/inspections/map.ts` (+ `.test.ts`): `turbineColor(status, maxSeverity)`, `boundsOf(points)`
- Create: `src/services/inspections/map-data.ts`
- Modify: `src/app/admin/inspecciones/sitios/[id]/page.tsx` (pestaña Mapa), `src/app/admin/inspecciones/proyectos/[id]/page.tsx`, `src/app/portal/proyectos/[id]/page.tsx`
- Modify: `.env.example` (`NEXT_PUBLIC_ESRI_API_KEY=` opcional, comentado)

**Interfaces:**
- `type MapTurbine = { assetId: string; name: string; lat: number | null; lon: number | null; status: InspectionStatus | null; maxSeverity: 1|2|3|4|5|null; counts: Record<1|2|3|4|5, number>; inspectionHref: string | null; idThumbUrl: string | null }`
- `loadSiteMap(sb, siteId)` y `loadProjectMap(sb, projectId)` → `MapTurbine[]` con la sesión (RLS): posición = `assets.lat/lon` ?? inspección más reciente con `asset_lat/lon`; estado = inspección más reciente del activo visible; severidad = máx de daños visibles; miniatura `_ID` firmada.
- `turbineColor`: sin inspección `#64748B`; `pending|captured|processing` `#3B82F6`; `in_review` `#F59E0B`; `approved` sin daños `#10B981`; `approved` con daños → color de Cat de `maxSeverity`.
- `nexus-style.ts`: `nexusStyle(): StyleSpecification` con fuente vectorial `https://tiles.openfreemap.org/planet` (comprobar la URL actual del `tilejson` en la documentación de OpenFreeMap al implementar) y capas de fondo, agua, caminos, edificios y etiquetas en la paleta NEXUS oscura; `satelliteStyle(apiKey)` con la capa ráster de Esri World Imagery (URL y parámetro de token según la documentación vigente de ArcGIS) y su atribución.
- `ParkMap({ turbines, satelliteEnabled })`: capa GeoJSON de círculos coloreados + etiquetas; `fitBounds` a `boundsOf`; tooltip al pasar; `TurbinePopup` al clic; botón Sencilla/Satélite (solo si `satelliteEnabled`); `MapFilters` (estado, severidad mínima) filtra la capa sin recargar. Lista «Sin posición» debajo.

- [ ] **Step 1: Pruebas** de `turbineColor` (cada estado y severidad) y `boundsOf` (un punto → caja mínima con margen; varios puntos).
- [ ] **Step 2:** FAIL → **Step 3:** `npm i maplibre-gl` e implementar → **Step 4:** `npm run test`, `npm run typecheck`, `npm run build` (confirmar en la salida que `maplibre-gl` no entra en el bundle de las demás páginas).
- [ ] **Step 5: Verificación en navegador**: sitio del Cliente A → WTG-25 en la posición real de la WTG 25 (no se versiona) con color «en revisión»; filtros; clic abre la ventana con la foto `_ID` y el enlace; sin `NEXT_PUBLIC_ESRI_API_KEY` no aparece Satélite; como `gerente@cliente-a.local` el mapa del proyecto se ve; como `gerente@cliente-b.local` el proyecto de A responde 404.
- [ ] **Step 6:** Commit.

---

### Task 13: Verificación final de la fase

**Files:**
- Modify: `docs/superpowers/specs/2026-11-15-inspecciones-fase3-visor-palas-design.md` (solo para registrar cambios durante la implementación, en una §9 nueva)

- [ ] **Step 1:** `npx supabase db reset && npx supabase test db` → 00–10 `ok`.
- [ ] **Step 2:** `npm run test && npm run typecheck && npm run build` → sin errores.
- [ ] **Step 3:** `cd scripts/ingest_demo && .venv/Scripts/pytest -q` → PASS.
- [ ] **Step 4:** Recargar la WTG 25 tras el reset (Tareas 4, 5 y 11) y repetir en el navegador el recorrido de §6.3 y el del mapa (§9.3).
- [ ] **Step 5:** Con `INSPECTIONS_ENABLED` vacío, `npm run build && npx next start -p 3102`: visor y pestañas responden 404.
- [ ] **Step 6:** Confirmar que nada tocó producción (`grep` del ref solo en docs; sin `--linked`). Commit de la §9 del spec.
