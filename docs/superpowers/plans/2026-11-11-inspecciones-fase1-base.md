# Inspecciones NEXUS · Fase 1 (base) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base de datos multi-cliente para inspecciones (palas, solar, líneas) en Supabase local, con aislamiento probado, Storage privado, contrato de subida `ingest_manifest`, admin mínimo, esqueleto del portal de clientes y un script de Python que demuestra el contrato.

**Architecture:** Migraciones SQL en `supabase/migrations/` con RLS basada en funciones `private.*` (patrón de VND generalizado), probadas con pgTAP (`supabase test db`). El portal Next.js 16 lee con la sesión del usuario (RLS) y solo usa la llave de servicio en el servidor para invitar usuarios. La app de PC (aquí, un script de demostración) sube archivos por TUS directo a Storage y registra todo con una sola llamada RPC.

**Tech Stack:** Supabase CLI 2.121 + Docker Desktop, Postgres 17, pgTAP, Next.js 16 (App Router), React 19, TypeScript 5.9, Zod 4, Vitest, Ajv, Python 3.12 (Pillow, tuspy, supabase-py, jsonschema, pytest).

**Spec:** `docs/superpowers/specs/2026-11-11-inspecciones-fase1-base-design.md` (leerlo completo antes de empezar; las secciones citadas como §N son de ese documento).

## Global Constraints

- **Nunca** `git commit`, `git push` ni subir archivos a servicios externos sin confirmación explícita del usuario en ese momento. Cada tarea termina con un checkpoint que **pregunta**; si no hay aprobación, se sigue sin commit.
- **Nunca** conectar, migrar ni escribir en el proyecto de producción `swedqyjhepghtwrmzlth`. Todo corre contra Supabase local (`http://127.0.0.1:54321`).
- La llave de servicio solo se usa en código de servidor (`createServiceClient`), nunca en el navegador ni en el script de Python.
- Funciones de permiso en el esquema `private`, `security definer`, `set search_path = ''`, nombres totalmente calificados (`public.tabla`, `auth.uid()`).
- Cada columna con medida lleva la unidad en el nombre (`_m`, `_mm`, `_px`, `_deg`, `_c`, `_pct`, `_mm2`).
- Textos de interfaz en español de México, con el estilo del panel actual (`panel`, `Button`, `label-caps`, tokens de color existentes). Sin tecnicismos innecesarios.
- Rutas nuevas responden 404 si `INSPECTIONS_ENABLED !== "true"`.
- `npm run typecheck` y `npm run build` deben pasar al final de cada tarea que toque TypeScript.
- No se importa nada de VND ni de otras fuentes. Fuera de alcance: LPS, instrumentos, pilotos, apps Android.

## Review Focus

1. **Perfil desactivado o miembro dado de baja con sesión abierta**: debe perder el acceso a datos en la siguiente consulta (las funciones leen el estado actual, sin caché). Prueba en Tarea 2.
2. **Cambiar la organización de un proyecto que ya tiene inspecciones**: rompería las rutas de Storage y mezclaría clientes; se debe rechazar. Prueba en Tarea 3.
3. **Rutas maliciosas en el manifiesto** (`..`, `//`, otra inspección del mismo proyecto, otra organización): se rechazan aunque el archivo exista. Prueba en Tarea 8.
4. **Manifiesto grande** (600 fotos, tamaño típico de una turbina): debe terminar en menos de 10 s en local. Prueba en Tarea 8.
5. **Metadatos de DJI como texto con signo** (`'+102.977'`) o faltantes (sin láser): el GSD cae a la siguiente fuente con su confianza, nunca da un valor inventado. Prueba en Tarea 13.

---

## Mapa de archivos

| Ruta | Responsabilidad |
|---|---|
| `supabase/config.toml` | Config local (quitar hook inexistente, plantilla de invitación) |
| `supabase/templates/invite.html` | Correo de invitación con `token_hash` |
| `supabase/migrations/20261108194834_create_assessment_requests.sql` | Copia exacta de producción |
| `supabase/migrations/20261111000100_inspections_identity.sql` | Tipos, perfiles, organizaciones, miembros, funciones de permiso |
| `supabase/migrations/20261111000200_inspections_catalog.sql` | Sitios, activos, specs, proyectos, asignaciones, inspecciones |
| `supabase/migrations/20261111000300_inspections_captures.sql` | Capturas, datos de pala, térmicos, tiras |
| `supabase/migrations/20261111000400_inspections_findings.sql` | Tipos de daño, daños, comentarios, `mark_finding_reviewed` |
| `supabase/migrations/20261111000500_inspections_change_log.sql` | Historial y triggers de auditoría |
| `supabase/migrations/20261111000600_inspections_storage.sql` | Bucket y políticas de Storage |
| `supabase/migrations/20261111000700_inspections_ingest.sql` | `ingest_manifest` |
| `supabase/seed.sql` | Datos locales de prueba (usuarios por rol, dos clientes) |
| `supabase/tests/helpers.psql` | Funciones de prueba (incluidas con `\ir`, no es un test) |
| `supabase/tests/0N_*.test.sql` | Pruebas pgTAP por tema |
| `src/contracts/ingest-manifest.v1.schema.json` | JSON Schema del manifiesto |
| `src/contracts/ingest-manifest.ts` | Esquema Zod equivalente |
| `src/contracts/inspections-admin.ts` | Esquemas Zod de formularios del admin |
| `src/lib/inspections/flag.ts` | Interruptor `INSPECTIONS_ENABLED` |
| `src/lib/auth/viewer.ts` | Quién es el usuario y a dónde va |
| `src/services/inspections/media.ts` | Enlaces firmados en lote |
| `src/app/auth/confirm/route.ts`, `src/app/auth/set-password/*` | Aceptar invitación y fijar contraseña |
| `src/app/admin/inspecciones/**` | Admin mínimo (§9.3) |
| `src/app/portal/**` | Esqueleto del portal de clientes |
| `scripts/ingest_demo/**` | Demostración del contrato en Python |

---

### Task 1: Entorno local y `assessment_requests` idéntica a producción

**Files:**
- Delete: `supabase/migrations/20261108000000_initial_schema.sql` (está en Git; recuperable)
- Create: `supabase/migrations/20261108194834_create_assessment_requests.sql`
- Create: `supabase/templates/invite.html`
- Modify: `supabase/config.toml`
- Modify: `.gitignore`
- Create: `.env.development.local` (no se versiona)
- Test: `supabase/tests/00_assessment.test.sql`, `supabase/tests/helpers.psql`

**Interfaces:**
- Produces (helpers.psql, esquema `tests`, se crea dentro de la transacción de cada archivo de prueba):
  - `tests.create_user(p_email text) returns uuid` — inserta en `auth.users` (el trigger crea el perfil cuando exista, Tarea 2).
  - `tests.login_as(p_uid uuid) returns void` — `set local role authenticated` + `set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true)`.
  - `tests.login_anon() returns void` — `set local role anon` + claims `{"role":"anon"}`.
  - `tests.logout() returns void` — `reset role` + claims vacíos.

- [ ] **Step 1: Preparar `config.toml`**
  - Eliminar el bloque `[auth.hook.custom_access_token]` (la función ya no existe).
  - `additional_redirect_urls = ["http://localhost:3000/auth/confirm"]`.
  - Agregar `[auth.email.template.invite]` con `subject = "Invitación a NEXUS"` y `content_path = "./supabase/templates/invite.html"`.
  - `invite.html`: enlace `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password`, texto breve en español.
- [ ] **Step 2: `.gitignore`**: agregar `.env*.local`, `supabase/.branches`, `scripts/ingest_demo/.venv/`, `__pycache__/`.
- [ ] **Step 3: Migración de `assessment_requests`**: mismas columnas, defaults, 15 `check`, `unique(reference)`, índices `assessment_requests_created_idx (created_at desc)` y `assessment_requests_ip_idx (source_ip_hash, created_at desc)`, `enable row level security` y **sin políticas** (igual que producción).
  - Primero copiar el SQL de la sección 10 de `20261108000000_initial_schema.sql`, que coincide con producción, a la nueva migración.
  - **Después** borrar el archivo viejo.
- [ ] **Step 4: Escribir `helpers.psql` y `00_assessment.test.sql`**

```sql
-- 00_assessment.test.sql
begin;
\ir helpers.psql
select plan(3);
select has_table('public', 'assessment_requests', 'existe la tabla del formulario');
select tests.login_anon();
select is_empty('select 1 from public.assessment_requests', 'anon no lee solicitudes');
select throws_ok($$insert into public.assessment_requests (industry) values ('x')$$, '42501', null, 'anon no inserta');
select * from finish();
rollback;
```

- [ ] **Step 5: Levantar Supabase local**
  - Iniciar Docker Desktop y confirmar con `docker info` (sin error de conexión).
  - Run: `npx supabase start` y luego `npx supabase db reset`.
  - Expected: termina sin errores y `npx supabase status` muestra API `http://127.0.0.1:54321`, Studio `:54323` y Mailpit `:54324`.
- [ ] **Step 6: Run `npx supabase test db`** → Expected: `00_assessment.test.sql .. ok`.
- [ ] **Step 7: `.env.development.local`** con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` (de `npx supabase status -o env`), `ADMIN_EMAILS=admin@nexus.local` e `INSPECTIONS_ENABLED=true`. Run `npm run dev` y confirmar que el sitio carga en `http://localhost:3000`.
- [ ] **Step 8: Checkpoint** — informar el resultado y **preguntar** si se hace commit.

---

### Task 2: Identidad — tipos, perfiles, organizaciones y funciones de permiso

**Files:**
- Create: `supabase/migrations/20261111000100_inspections_identity.sql`
- Modify: `supabase/tests/helpers.psql`
- Test: `supabase/tests/01_identity.test.sql`

**Interfaces:**
- Produces (SQL):
  - Tipos: `public.platform_role ('admin','technician','service')`, `public.org_member_role ('client_manager','client_viewer')`.
  - Tablas `public.profiles`, `public.organizations`, `public.organization_members` (§4.2).
  - `private.set_updated_at() returns trigger`.
  - `private.is_active_user()`, `private.is_admin()`, `private.is_staff()`, `private.is_org_member(o uuid, roles public.org_member_role[] default null)`, `private.can_read_org(o uuid)` — todas `returns boolean`, `stable`, `security definer`, `set search_path = ''`, y todas exigen `profiles.is_active` (§3.3).
  - Trigger `handle_new_user` en `auth.users` → inserta `profiles(id, email, full_name)` **sin rol**.
  - Trigger que impide personal + miembro de cliente a la vez (en `profiles` al poner rol y en `organization_members` al insertar).
- Produces (helpers): `tests.set_role(p_uid uuid, p_role public.platform_role)`, `tests.add_member(p_org uuid, p_uid uuid, p_role public.org_member_role)` (ambas como `postgres`, saltando RLS).

- [ ] **Step 1: Escribir `01_identity.test.sql`** con estas aserciones:

```sql
-- usuarios: admin, tech, mgr_a (miembro de A), mgr_b (miembro de B)
select is((select platform_role from public.profiles where id = :tech), null, 'perfil nuevo sin rol');
select throws_ok(format('select tests.add_member(%L, %L, ''client_viewer'')', :org_a, :tech), 'P0001', null,
  'personal de NEXUS no puede ser miembro de cliente');
select tests.login_as(:mgr_a);
select results_eq('select id from public.organizations', format('values (%L::uuid)', :org_a), 'cliente A solo ve su organización');
select is_empty(format('select 1 from public.organization_members where organization_id = %L', :org_b), 'A no ve miembros de B');
select throws_ok('insert into public.organizations (name, slug) values (''X'', ''x'')', '42501', null, 'cliente no crea organizaciones');
select tests.logout();
update public.profiles set is_active = false where id = :mgr_a;
select tests.login_as(:mgr_a);
select is_empty('select 1 from public.organizations', 'perfil desactivado pierde acceso al instante');   -- Review Focus 1
select tests.logout();
update public.profiles set is_active = true where id = :mgr_a;
delete from public.organization_members where user_id = :mgr_a;
select tests.login_as(:mgr_a);
select is_empty('select 1 from public.organizations', 'baja de la organización quita el acceso');      -- Review Focus 1
select tests.login_as(:admin);
select ok((select count(*) from public.organizations) = 2, 'admin ve todas');
```

(Los `:var` se obtienen con `\gset` tras crear los usuarios y organizaciones al inicio del archivo.)

- [ ] **Step 2: Run `npx supabase test db`** → Expected: FAIL (`relation "public.profiles" does not exist`).
- [ ] **Step 3: Escribir la migración.** Políticas:
  - `profiles`: select propio o `is_staff()`; update propio (`full_name`) o admin; solo el admin cambia `platform_role` e `is_active`, por trigger.
  - `organizations`: select `can_read_org(id)`; insert, update y delete solo admin.
  - `organization_members`: select admin o `user_id = auth.uid()`; escritura solo admin.
  - Triggers `set_updated_at` en las tres tablas.
  - Revocar `execute` de `private.*` a `anon`; `grant usage on schema private to authenticated`.
- [ ] **Step 4: Run `npx supabase db reset && npx supabase test db`** → Expected: `00` y `01` en `ok`.
- [ ] **Step 5: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 3: Catálogo, proyectos, asignaciones e inspecciones

**Files:**
- Create: `supabase/migrations/20261111000200_inspections_catalog.sql`
- Modify: `supabase/tests/helpers.psql`
- Test: `supabase/tests/02_catalog.test.sql`

**Interfaces:**
- Consumes: funciones de la Tarea 2.
- Produces (SQL):
  - Tipos `site_kind`, `asset_kind`, `project_status`, `inspection_kind`, `inspection_status` (§4.1).
  - Tablas `sites`, `assets`, `wind_turbine_specs`, `projects`, `project_sites`, `project_assignments`, `inspections` (§4.2).
  - `private.is_assigned(p uuid)`, `private.org_of_project(p uuid) returns uuid`, `private.can_read_project(p uuid)`, `private.can_write_project(p uuid)`, `private.can_comment_project(p uuid)`, `private.inspection_is_locked(i uuid)`, `private.can_edit_inspection_data(p uuid, i uuid)` (§3.3).
  - `private.can_read_org` amplía su definición para incluir a quien está asignado a un proyecto de la organización.
- Produces (helpers): `tests.make_world() returns jsonb` — como `postgres`, crea 2 organizaciones (A y B) y estos usuarios: `admin`, `tech_a` (asignado al proyecto A), `tech_b` (asignado al B), `service_a` (asignado al A), `mgr_a`, `viewer_a`, `mgr_b`. Además, por organización: un sitio `wind_farm`, un activo `wind_turbine` con specs (`blade_length_m = 61.2`), un proyecto y una inspección `wind_blade`. Devuelve los `id` con claves `org_a`, `org_b`, `project_a`, `project_b`, `inspection_a`, `inspection_b`, `asset_a`, `site_a` y los nombres de usuario. Tareas posteriores lo amplían con fotos.

- [ ] **Step 1: Escribir `02_catalog.test.sql`**: `make_world()` y luego:
  - `tech_a` ve el proyecto A y no el B; `tech_a` no lee el sitio de B.
  - `mgr_a` ve el proyecto A completo y no el B.
  - `tech_a` puede `update inspections set notes = 'x'` en A y no en B.
  - `tech_a` no puede poner `status = 'approved'` (excepción); `admin` sí (y se llenan `approved_at` y `approved_by`); `tech_a` ya no puede editar `notes` de la inspección aprobada; `admin` sí.
  - `project_sites` con un sitio de B en el proyecto A → excepción.
  - `assets.organization_id` distinto del de su sitio → excepción.
  - `update projects set organization_id = :org_b where id = :project_a` (con inspecciones) → excepción, incluso como admin (Review Focus 2).
  - `project_assignments` de un usuario sin `platform_role` técnico o servicio → excepción.
  - `viewer_a` no puede escribir en ninguna tabla del catálogo.
  - `tests.login_anon()`: `organizations`, `sites`, `assets`, `projects` e `inspections` vacías (prueba 14).
- [ ] **Step 2: Run** → Expected: FAIL (`relation "public.sites" does not exist`).
- [ ] **Step 3: Escribir la migración** con las reglas de escritura de §4.3. Restricciones únicas:
  - `sites (organization_id, name)`;
  - `assets (site_id, name)`;
  - `inspections (project_id, asset_id, kind)`.

  Trigger de aprobación en `inspections`: entrar o salir de `approved` exige `is_admin()` y fija `approved_at` y `approved_by`. Trigger en `projects`: rechaza cambiar `organization_id` si existen inspecciones.
- [ ] **Step 4: Run `npx supabase db reset && npx supabase test db`** → Expected: `00`–`02` en `ok`.
- [ ] **Step 5: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 4: Capturas, datos de pala, térmicos y tiras

**Files:**
- Create: `supabase/migrations/20261111000300_inspections_captures.sql`
- Modify: `supabase/tests/helpers.psql`
- Test: `supabase/tests/03_captures.test.sql`

**Interfaces:**
- Produces (SQL):
  - Tipos de §5.1.
  - Tablas `captures`, `blade_captures`, `thermal_captures`, `mosaics` (columnas exactas de §5.2–5.5, con los `check` siguientes):
    - `width_px > 0`;
    - `gsd_mm_px > 0`;
    - `sha256 ~ '^[0-9a-f]{64}$'`;
    - en `thermal_captures`, `temp_scale` por defecto `0.01` y `temp_offset` por defecto `-100`.
  - Único `captures (inspection_id, sha256)`.
  - `private.enforce_parent_project() returns trigger` — genérico. Los argumentos son `TG_ARGV[0]` = tabla padre y `TG_ARGV[1]` = columna FK. Si la FK no es nula, exige `new.project_id` igual al `project_id` del padre; si no, lanza `P0001 'project_mismatch'`. Para `blade_captures` y `thermal_captures`, el padre es `captures` con FK `capture_id`.
  - Políticas: select `can_read_project(project_id)`; insert y update `can_edit_inspection_data(project_id, inspection_id)` (en las tablas 1:1 se obtiene `inspection_id` a través de `capture_id`); delete igual a update.
- Produces (helpers): `make_world()` agrega a cada inspección una captura RGB con su `blade_captures` (A, LE). Claves nuevas: `capture_a` y `capture_b`.

- [ ] **Step 1: Escribir `03_captures.test.sql`**:
  - `mgr_a` lee `capture_a` y no `capture_b` (prueba 1 de §10.1).
  - Insertar una captura con `project_id = project_a` e `inspection_id = inspection_b` → `project_mismatch` (prueba 5).
  - Insertar `blade_captures` con `project_id` distinto al de su captura → `project_mismatch`.
  - Con `inspection_a` aprobada, `tech_a` no inserta, actualiza ni borra capturas, y `admin` sí (prueba 10).
  - Un `sha256` duplicado en la misma inspección → `23505`.
  - `face = 'XX'` → error de tipo.
- [ ] **Step 2: Run** → Expected: FAIL.
- [ ] **Step 3: Escribir la migración.**
- [ ] **Step 4: Run `npx supabase db reset && npx supabase test db`** → Expected: `00`–`03` en `ok`.
- [ ] **Step 5: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 5: Daños, tipos de daño, comentarios y revisión del cliente

**Files:**
- Create: `supabase/migrations/20261111000400_inspections_findings.sql`
- Test: `supabase/tests/04_findings.test.sql`

**Interfaces:**
- Produces (SQL):
  - Tipos `finding_status`, `finding_source`; tablas `finding_types`, `findings`, `comments` (§6.2–6.4). Además, `comments.author_name text not null`, que llena un trigger desde `profiles.full_name` (o `email`) al insertar, para mostrar el autor sin abrir `profiles` a los clientes.
  - `check` en `findings`:
    - exactamente uno de `capture_id` o `mosaic_id`;
    - `severity between 1 and 5`;
    - `ai_confidence between 0 and 1`;
    - `region`: `jsonb_typeof(region->'points') = 'array'` y `region->>'type' in ('box','polygon')`.
  - Triggers en `findings`:
    - `enforce_parent_project` para `inspections`/`inspection_id`, `captures`/`capture_id` y `mosaics`/`mosaic_id`;
    - `ai_original` inmutable después del insert (`P0001 'ai_original_immutable'`);
    - `corrected_at` y `corrected_by` se fijan en update cuando `current_setting('nexus.ingest', true) is distinct from 'on'` y cambia `type_id`, `severity`, `status`, `region` o alguna medida.
  - Políticas de `findings`: select `can_read_project`; insert y update `can_edit_inspection_data`; delete solo `is_admin()`.
  - Políticas de `comments`: select `can_read_project`; insert `can_comment_project(project_id) and author_id = auth.uid()`; update solo el autor (fija `edited_at`); delete el autor o el admin.
  - `public.mark_finding_reviewed(p_finding_id uuid) returns void` — `security definer`; exige `is_org_member(org_of_project(project_id), array['client_manager'])`; solo escribe `client_reviewed_at = now()` y `client_reviewed_by = auth.uid()`.
  - Semilla en la migración (también aplica en la nube): `finding_types` del dominio `wind_blade`, con códigos `erosion_le` (Erosión del borde de ataque / Leading edge erosion), `crack` (Grieta / Crack), `delamination` (Delaminación / Delamination), `lightning` (Impacto de rayo / Lightning damage), `contamination` (Contaminación / Contamination), `missing_paint` (Pintura faltante / Missing paint) y `other` (Otro / Other).

- [ ] **Step 1: Escribir `04_findings.test.sql`** (pruebas 6, 7, 9 y 11 de §10.1):
  - `mgr_a` llama `mark_finding_reviewed` y se llena `client_reviewed_at`.
  - `mgr_a` no puede `update findings set severity = 5`: 0 filas afectadas o excepción, y la severidad sigue igual.
  - `viewer_a` no inserta comentarios (`42501`) y `mark_finding_reviewed` le lanza `P0001`.
  - `tech_a` cambia la severidad: `corrected_at` se llena y `ai_original` no cambia.
  - `update findings set ai_original = '{}'` → `ai_original_immutable`.
  - Con `set_config('nexus.ingest','on',true)`, un update **no** llena `corrected_at`.
  - `tech_a` no puede borrar un daño y `admin` sí.
  - `mgr_b` no ve los daños ni los comentarios de A.
  - El `author_name` del comentario se llena solo.
  - Con `inspection_a` aprobada, `tech_a` no edita daños, pero `mgr_a` y `tech_a` **sí** pueden comentar (§6.6).
- [ ] **Step 2: Run** → Expected: FAIL.
- [ ] **Step 3: Escribir la migración.**
- [ ] **Step 4: Run `npx supabase db reset && npx supabase test db`** → Expected: `00`–`04` en `ok`.
- [ ] **Step 5: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 6: Historial de cambios (`change_log`)

**Files:**
- Create: `supabase/migrations/20261111000500_inspections_change_log.sql`
- Test: `supabase/tests/05_change_log.test.sql`

**Interfaces:**
- Produces (SQL):
  - Tabla `change_log` (§6.5), `id bigint generated always as identity`, índice `(project_id, at desc)`.
  - `private.audit_change() returns trigger` — `security definer`, dueño `postgres`. `TG_ARGV` es la lista de columnas a vigilar (vacía = todas menos `updated_at`). En update registra solo si cambió alguna columna vigilada, guardando en `old`/`new` solo esas columnas.
  - Triggers `after insert or update or delete`:
    - `findings` (todas);
    - `captures` (`gsd_mm_px`, `gsd_source`, `gsd_confidence`);
    - `blade_captures` (`radius_center_m`, `face`);
    - `mosaics` (`tip_row_px`, `root_row_px`, `blade_length_m`, `mm_per_px`, `root_at_top`);
    - `inspections` (`blade_length_m`, `status`).
  - Trigger `before update or delete` en `change_log` que lanza `P0001 'change_log_immutable'`.
  - Política select: `is_staff() and can_read_project(project_id)`. Sin políticas de escritura.

- [ ] **Step 1: Escribir `05_change_log.test.sql`** (prueba 8):
  - `tech_a` corrige la severidad y aparece una fila con `actor_id = tech_a`, `old->>'severity'` y `new->>'severity'`.
  - Cambiar `captures.file_name` **no** genera fila; cambiar `gsd_mm_px` sí.
  - `admin` no puede actualizar ni borrar `change_log` (`change_log_immutable`).
  - `mgr_a` no lee el historial (vacío).
- [ ] **Step 2: Run** → Expected: FAIL.
- [ ] **Step 3: Escribir la migración.**
- [ ] **Step 4: Run `npx supabase db reset && npx supabase test db`** → Expected: `00`–`05` en `ok`.
- [ ] **Step 5: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 7: Storage privado

**Files:**
- Create: `supabase/migrations/20261111000600_inspections_storage.sql`
- Test: `supabase/tests/06_storage.test.sql`

**Interfaces:**
- Produces (SQL):
  - Bucket `inspection-media`: `public = false`, `allowed_mime_types` de §7, `file_size_limit = null` (lo rige el config local o el plan en la nube).
  - `private.storage_path_ids(name text) returns table(org_id uuid, project_id uuid, inspection_id uuid)`: segmentos 1–3. Devuelve vacío si algún segmento no es UUID o si la ruta contiene `..` o `//`.
  - `private.storage_can_read(name text) returns boolean`: la ruta es válida, `org_of_project(project_id) = org_id`, la inspección pertenece al proyecto y `can_read_project`.
  - `private.storage_can_write(name text) returns boolean`: las mismas condiciones, con `can_edit_inspection_data` en lugar de `can_read_project`.
  - Políticas en `storage.objects` para `bucket_id = 'inspection-media'`: select `storage_can_read(name)`; insert y update `storage_can_write(name)`; delete `private.is_admin()`.

- [ ] **Step 1: Escribir `06_storage.test.sql`** (pruebas 2, 4 y 14). La lectura y la escritura se simulan con `insert` y `select` en `storage.objects` como `authenticated`:
  - `tech_a` inserta `{org_a}/{project_a}/{inspection_a}/captures/{capture_a}/original.jpg`.
  - `tech_a` no inserta en `{org_b}/{project_a}/…` (organización que no corresponde, prueba 4).
  - `tech_a` no inserta en `{org_a}/{project_a}/../x` (ruta inválida).
  - `mgr_a` lee el objeto de A y `mgr_b` no; `mgr_b` no lo ve al listar.
  - Con la inspección aprobada, `tech_a` no inserta.
  - `anon` no lee ni inserta.
  - `select public from storage.buckets where id = 'inspection-media'` es `false`.
- [ ] **Step 2: Run** → Expected: FAIL.
- [ ] **Step 3: Escribir la migración.**
- [ ] **Step 4: Run `npx supabase db reset && npx supabase test db`** → Expected: `00`–`06` en `ok`.
- [ ] **Step 5: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 8: Contrato del manifiesto v1 y `ingest_manifest`

**Files:**
- Create: `src/contracts/ingest-manifest.v1.schema.json`
- Create: `src/contracts/ingest-manifest.ts`
- Create: `src/contracts/__fixtures__/manifest/*.json`
- Create: `src/contracts/ingest-manifest.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (devDependencies `vitest`, `ajv`, `ajv-formats`; script `"test": "vitest run"`)
- Create: `supabase/migrations/20261111000700_inspections_ingest.sql`
- Test: `supabase/tests/07_ingest.test.sql`

**Interfaces:**
- Produces (TS):
  - `export const MANIFEST_VERSION = 1`.
  - `export const IngestManifestSchema: z.ZodType`; `export type IngestManifest = z.infer<typeof IngestManifestSchema>`. La estructura es la de §8.2:
    - `captures` y `findings` pueden estar vacíos, pero no los dos a la vez;
    - cada daño trae `capture_id` **o** `mosaic_id`;
    - `region.points` tiene valores en [0, 1];
    - `severity` es un entero de 1 a 5.
  - `export type IngestResult = { inserted: Record<"captures"|"blade_captures"|"thermal_captures"|"mosaics"|"findings", number>; updated: …mismo; skipped: { findings: string[] } }`.
- Produces (SQL): `public.ingest_manifest(p_manifest jsonb) returns jsonb`, `security invoker`, `volatile`, con `set_config('nexus.ingest','on',true)` al inicio. Los errores se lanzan con `raise exception using errcode = '22023', message = 'manifest_invalid', detail = <jsonb array de {path, code}>`. El llamador lee `detail`.
- Códigos de error: `unsupported_version`, `forbidden_project`, `inspection_locked`, `asset_other_org`, `bad_path`, `missing_object`, `unknown_finding_type`, `unknown_capture`, `duplicate_sha256`.

- [ ] **Step 1: Fixtures y prueba de paridad (Vitest)**
  - Fixtures válidos: `valid-full.json` (fotos, pala y un daño de IA) y `valid-findings-only.json`.
  - Fixtures inválidos: `invalid-severity-6.json`, `invalid-both-targets.json`, `invalid-region-out-of-range.json`, `invalid-version-2.json` e `invalid-empty.json`.

```ts
// src/contracts/ingest-manifest.test.ts
for (const f of fixtures) {
  test(`${f.name}: Zod y JSON Schema coinciden`, () => {
    const zodOk = IngestManifestSchema.safeParse(f.data).success;
    const ajvOk = validateJsonSchema(f.data);
    expect(zodOk).toBe(f.name.startsWith("valid-"));
    expect(ajvOk).toBe(zodOk);
  });
}
```

- [ ] **Step 2: Run `npm run test`** → Expected: FAIL (`Cannot find module './ingest-manifest'`).
- [ ] **Step 3: Escribir el JSON Schema (draft 2020-12) y el esquema Zod.** Run `npm run test` → Expected: PASS.
- [ ] **Step 4: Escribir `07_ingest.test.sql`** (prueba 13 y Review Focus 3–4). Antes de llamar, insertar como `postgres` las filas de `storage.objects` que el manifiesto cita.
  - `tech_a` ingiere 3 fotos, 3 `blade_captures` y 1 daño de IA, y el resultado reporta `inserted.captures = 3`.
  - Repetir el mismo manifiesto da `inserted = 0` y `updated.captures = 3`, sin filas nuevas.
  - Un daño de IA corregido por `tech_a` y luego re-ingerido queda igual, y su `id` aparece en `skipped.findings`.
  - Un manifiesto de solo daños apuntando a `capture_a` existente funciona (cuenta `service_a`).
  - Ruta citada sin objeto en Storage → `missing_object` y **nada** quedó insertado (conteo igual al anterior).
  - Rutas con `..`, de otra inspección del mismo proyecto o de `org_b` → `bad_path` (Review Focus 3).
  - El mismo `sha256` con otro `id` → `duplicate_sha256`.
  - `tech_b` sobre el proyecto A → `forbidden_project`.
  - Con la inspección aprobada → `inspection_locked`.
  - `service_a` no puede borrar daños después (`delete` afecta 0 filas).
  - 600 fotos sintéticas: `ok(clock_timestamp() - t0 < interval '10 seconds')` (Review Focus 4).
- [ ] **Step 5: Run** → Expected: FAIL (`function public.ingest_manifest(jsonb) does not exist`).
- [ ] **Step 6: Escribir la migración.**
  - **Validación primero, inserciones después:** todas las comprobaciones de rutas y objetos se hacen con consultas por conjuntos sobre `jsonb_to_recordset`. Los errores se acumulan y se lanzan juntos.
  - **Inserciones:** `insert … on conflict (id) do update`. En daños de IA, el `do update` incluye `where findings.corrected_at is null`, y los que se omiten se reportan en `skipped`.
  - **Al terminar:** la inspección pasa a `in_review` si estaba en `pending`, `captured` o `processing`.
- [ ] **Step 7: Run `npx supabase db reset && npx supabase test db && npm run test`** → Expected: todo en `ok` / PASS.
- [ ] **Step 8: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 9: Datos locales de prueba y tipos de TypeScript

**Files:**
- Create: `supabase/seed.sql`
- Modify: `src/services/supabase/database.types.ts` (generado)

**Interfaces:**
- Produces: usuarios locales con contraseña común `Nexus-Local-2026!` (solo funciona en `127.0.0.1`), anotada en un comentario al inicio de `seed.sql`:
  - `admin@nexus.local` (admin);
  - `tecnico@nexus.local` (technician, asignado al proyecto de Cliente A);
  - `servicio@nexus.local` (service, asignado al mismo);
  - `gerente@cliente-a.local` (client_manager A), `lector@cliente-a.local` (client_viewer A), `gerente@cliente-b.local` (client_manager B).
- Datos de catálogo: «Cliente A» con el parque «Parque Demo A» y las turbinas `WTG-01` y `WTG-02` (Vestas V136, pala 66.7 m), un proyecto «Inspección 2026 A» y una inspección `wind_blade` de `WTG-01` en `pending`. «Cliente B», igual, con un proyecto propio.
- Los usuarios se insertan en `auth.users` con `encrypted_password = crypt(…, gen_salt('bf'))`, `email_confirmed_at = now()`, `aud`/`role` en `'authenticated'`, tokens en `''`, y su fila en `auth.identities` (`provider = 'email'`).

- [ ] **Step 1: Escribir `seed.sql`.** Run `npx supabase db reset` → Expected: sin errores.
- [ ] **Step 2: Verificar el inicio de sesión de cada usuario:**
  - Run: `curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: <publishable>" -H "content-type: application/json" -d '{"email":"tecnico@nexus.local","password":"Nexus-Local-2026!"}'`.
  - Expected: JSON con `access_token`. Repetir con `gerente@cliente-b.local`.
- [ ] **Step 3: Run `npm run db:types`** → `database.types.ts` incluye `inspections` e `ingest_manifest`. Run `npm run typecheck` → Expected: sin errores.
- [ ] **Step 4: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 10: Acceso por rol, interruptor y aceptación de invitaciones

**Files:**
- Create: `src/lib/inspections/flag.ts`
- Create: `src/lib/auth/viewer.ts`
- Create: `src/lib/auth/viewer.test.ts`
- Create: `src/app/auth/confirm/route.ts`
- Create: `src/app/auth/set-password/page.tsx`, `src/app/auth/set-password/actions.ts`, `src/app/auth/layout.tsx`
- Create: `src/app/admin/login/actions.ts`
- Modify: `src/components/admin/LoginForm.tsx`
- Modify: `src/app/admin/login/page.tsx`
- Modify: `src/proxy.ts`
- Modify: `src/components/admin/AdminHeader.tsx`

**Interfaces:**
- Produces:
  - `inspectionsEnabled(): boolean` y `assertInspectionsEnabled(): void` (llama `notFound()`) en `flag.ts`.
  - En `viewer.ts` (`server-only`):
    - `type Viewer = { user: User; platformRole: PlatformRole | null; memberships: { organizationId: string; role: OrgMemberRole }[] }`;
    - `getViewer(): Promise<Viewer | null>`, que lee `profiles` y `organization_members` con la sesión;
    - `requireStaff(): Promise<Viewer>`: `admin` o `technician` activo; si no, redirige a `/admin/login?error=forbidden`;
    - `requireClient(): Promise<Viewer>`: al menos una membresía; si no, redirige a `/portal/login?error=forbidden`;
    - `homePathFor(v: Pick<Viewer, "platformRole" | "memberships"> & { isAdminEmail: boolean }, enabled: boolean): string | null` — función **pura**. Quien la llama pasa `inspectionsEnabled()`.
  - `resolveLoginDestination(): Promise<{ path: string } | { error: "forbidden" }>` en `src/app/admin/login/actions.ts`: si devuelve `null`, cierra la sesión.
  - `LoginForm` recibe `area: "admin" | "portal"`. Después de iniciar sesión llama `resolveLoginDestination()` y navega al destino.

- [ ] **Step 1: Escribir `viewer.test.ts`** para `homePathFor`:

```ts
expect(homePathFor({ platformRole: null, memberships: [], isAdminEmail: true }, true)).toBe("/admin");
expect(homePathFor({ platformRole: "admin", memberships: [], isAdminEmail: false }, true)).toBe("/admin/inspecciones");
expect(homePathFor({ platformRole: "technician", memberships: [], isAdminEmail: false }, true)).toBe("/admin/inspecciones");
expect(homePathFor({ platformRole: "service", memberships: [], isAdminEmail: false }, true)).toBeNull();
expect(homePathFor({ platformRole: null, memberships: [{ organizationId: "o", role: "client_viewer" }], isAdminEmail: false }, true)).toBe("/portal");
expect(homePathFor({ platformRole: null, memberships: [], isAdminEmail: false }, true)).toBeNull();
// Inspecciones desactivadas: solo el panel de solicitudes
expect(homePathFor({ platformRole: "technician", memberships: [], isAdminEmail: true }, false)).toBe("/admin");
expect(homePathFor({ platformRole: null, memberships: [{ organizationId: "o", role: "client_manager" }], isAdminEmail: false }, false)).toBeNull();
```
- [ ] **Step 2: Run `npm run test`** → Expected: FAIL. Implementar. Run → PASS.
- [ ] **Step 3: `proxy.ts`**
  - `matcher: ["/admin/:path*", "/portal/:path*"]`.
  - Sin sesión: `/portal/*` va a `/portal/login` y `/admin/*` a `/admin/login`; las páginas de login quedan exentas.
  - Mantener las cabeceras `no-store` y `noindex`.
- [ ] **Step 4: Invitaciones**
  - `GET /auth/confirm`: `verifyOtp({ type: "invite", token_hash })` con el cliente de sesión, y luego redirige a `next` (solo rutas que empiezan con `/` y no con `//`).
  - `/auth/set-password`: un formulario de contraseña con la misma regla de `config.toml` (12 caracteres, mayúsculas, minúsculas, dígitos y símbolos). Al guardar, redirige con `resolveLoginDestination()`.
- [ ] **Step 5: `AdminHeader`**: enlace «Inspecciones» si `inspectionsEnabled()` y el usuario es personal de NEXUS.
- [ ] **Step 6: Verificar**
  - Run `npm run typecheck && npm run build` → Expected: sin errores.
  - Con `npm run dev`:
    - `tecnico@nexus.local` cae en `/admin/inspecciones` (404 hasta la Tarea 11);
    - `gerente@cliente-a.local` cae en `/portal`;
    - `servicio@nexus.local` ve «Esta cuenta no tiene acceso».
- [ ] **Step 7: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 11: Admin — organizaciones y usuarios

**Files:**
- Create: `src/contracts/inspections-admin.ts`, `src/contracts/inspections-admin.test.ts`
- Create: `src/app/admin/inspecciones/layout.tsx`, `src/app/admin/inspecciones/page.tsx`
- Create: `src/app/admin/inspecciones/organizaciones/page.tsx`, `src/app/admin/inspecciones/organizaciones/[id]/page.tsx`
- Create: `src/app/admin/inspecciones/usuarios/page.tsx`
- Create: `src/app/admin/inspecciones/actions/organizations.ts`, `src/app/admin/inspecciones/actions/users.ts`
- Create: `src/components/inspections/admin/InspectionsNav.tsx`

**Interfaces:**
- Consumes: `requireStaff`, `assertInspectionsEnabled`, `createSessionClient`, `createServiceClient`.
- Produces (Zod, en `inspections-admin.ts`):
  - `OrganizationInputSchema { name: 2–120, slug: /^[a-z0-9-]{2,60}$/ }`;
  - `InviteUserSchema { email, full_name: 2–120, kind: "staff" | "client", platform_role?: "admin" | "technician" | "service", organization_id?: uuid, member_role?: "client_manager" | "client_viewer" }`, con un `superRefine`: si `kind` es `staff`, exige `platform_role`; si es `client`, exige `organization_id` y `member_role`.
- Produces (acciones, todas con `requireStaff()` y además comprobación de admin; devuelven `{ ok: true } | { ok: false; message: string }`):
  - `createOrganization(fd)`, `renameOrganization(fd)`;
  - `inviteUser(fd)`: usa `auth.admin.inviteUserByEmail(email, { data: { full_name } })` con el **cliente de servicio** (el enlace lo arma la plantilla de la Tarea 1 con `{{ .SiteURL }}`; no se pasa `redirectTo`) y luego asigna rol o membresía con el **cliente de sesión** (RLS de admin);
  - `setUserActive(fd)`, `removeMembership(fd)`.

- [ ] **Step 1: `inspections-admin.test.ts`**: casos válidos e inválidos de los dos esquemas, incluidos `kind: "client"` sin `organization_id` (inválido) y un slug con mayúsculas (inválido). Run → FAIL. Implementar. Run → PASS.
- [ ] **Step 2: Layout y navegación**
  - El layout llama `assertInspectionsEnabled()` y `requireStaff()`, y muestra `AdminHeader` más `InspectionsNav` (Organizaciones, Usuarios, Sitios, Proyectos).
  - Los formularios de solo admin no se muestran a técnicos.
  - La página índice redirige a `proyectos`.
- [ ] **Step 3: Páginas**
  - Organizaciones: lista con conteo de proyectos, formulario de alta, y detalle con renombrar y miembros.
  - Usuarios: lista de personal y clientes (nombre, correo, rol u organización, activo) y formulario de invitación.
  - Los mensajes de error van en español, sin detalles técnicos.
- [ ] **Step 4: Verificar en el navegador** con `npm run dev` y `admin@nexus.local`:
  - crear la organización «Cliente C»;
  - invitar a `nuevo@cliente-c.local` como `client_viewer`;
  - abrir Mailpit (`http://127.0.0.1:54324`), seguir el enlace, fijar la contraseña y comprobar que cae en `/portal` sin ver datos de A ni de B.

  Con `tecnico@nexus.local`, la pantalla de usuarios no muestra el formulario de invitación.
- [ ] **Step 5: Run `npm run typecheck && npm run build && npm run test`** → Expected: sin errores.
- [ ] **Step 6: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 12: Admin — sitios, activos, proyectos e inspecciones

**Files:**
- Modify: `src/contracts/inspections-admin.ts`, `src/contracts/inspections-admin.test.ts`
- Create: `src/app/admin/inspecciones/sitios/page.tsx`, `src/app/admin/inspecciones/sitios/[id]/page.tsx`
- Create: `src/app/admin/inspecciones/proyectos/page.tsx`, `src/app/admin/inspecciones/proyectos/[id]/page.tsx`
- Create: `src/app/admin/inspecciones/proyectos/[id]/inspecciones/[inspectionId]/page.tsx`
- Create: `src/app/admin/inspecciones/actions/catalog.ts`, `src/app/admin/inspecciones/actions/projects.ts`
- Create: `src/services/inspections/media.ts`
- Create: `src/components/inspections/CaptureGrid.tsx`

**Interfaces:**
- Produces (Zod):
  - `SiteInputSchema { organization_id, kind, name: 2–120, lat?: −90..90, lon?: −180..180 }`;
  - `AssetInputSchema { site_id, kind, name: 1–60, code?, lat?, lon?, turbine?: { manufacturer?, model?, blade_length_m?: 1..150, rotor_diameter_m?: 1..300, hub_height_m?: 1..250 } }`;
  - `ProjectInputSchema { organization_id, name: 2–160, code?, status, start_date?, end_date?, contacts: { role, name, email? }[] ≤ 20 }`, con `end_date >= start_date`;
  - `AssignmentSchema { project_id, user_id }`;
  - `InspectionInputSchema { project_id, asset_id, kind }`.
- Produces (servicio): `signPaths(sb: SupabaseClient<Database>, paths: string[], expiresInSeconds = 3600): Promise<Map<string, string>>`. Usa `storage.from("inspection-media").createSignedUrls` en lotes de 100 y omite las rutas que fallan.
- Produces (acciones), con permisos que aplica RLS (el error de RLS se traduce a «No tienes permiso para esta acción»):
  - `upsertSite`, `upsertAsset`, `upsertProject`, `linkProjectSite`, `assignUser`, `unassignUser`, `createInspection`, `setInspectionStatus` (solo `approved` y su reversa por admin).

- [ ] **Step 1: Pruebas Zod de los esquemas nuevos**, incluidos `end_date < start_date` (inválido) y `blade_length_m = 0` (inválido). Run → FAIL. Implementar. Run → PASS.
- [ ] **Step 2: Páginas**
  - **Sitios:** lista filtrada por `?org=`. El detalle muestra los activos con sus especificaciones de turbina.
  - **Proyectos:** lista por organización y estado. El detalle permite editar datos y contactos, ligar sitios, asignar técnicos y servicios, crear inspecciones por activo y ver cada inspección con su estado y número de fotos.
  - **Inspección:** `CaptureGrid` con las miniaturas firmadas (`thumb_path`) agrupadas por pala y cara, y el botón «Aprobar» o «Reabrir» solo para el admin.
  - **Técnicos:** ven solo sus proyectos asignados, porque RLS los filtra; no se agrega filtrado extra en el código.
- [ ] **Step 3: Verificar en el navegador**
  - Con `admin@nexus.local`, crear un parque y una turbina para «Cliente C», un proyecto, asignar a `tecnico@nexus.local` y crear una inspección.
  - Con `tecnico@nexus.local`, ver solo los proyectos asignados.
  - Aprobar la inspección como admin; el técnico ya no puede editar sus datos y ve el estado «Aprobada».
- [ ] **Step 4: Run `npm run typecheck && npm run build && npm run test`** → Expected: sin errores.
- [ ] **Step 5: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 13: Script de demostración del contrato (Python)

Este script también cumple el papel de `scripts/seed-media` de §9.1. La carpeta `EXIF/` no trae fotos de ejemplo, así que las fotos las indica el usuario con `--folder`. En la Tarea 15 se actualiza §9.1 del diseño para reflejarlo.

**Files:**
- Create: `scripts/ingest_demo/pyproject.toml` (deps: `pillow`, `tuspy`, `supabase`, `jsonschema`; dev: `pytest`)
- Create: `scripts/ingest_demo/ingest_demo/{__init__,exif,gsd,media,manifest,upload,cli}.py`
- Create: `scripts/ingest_demo/tests/{test_exif,test_gsd,test_manifest}.py`
- Create: `scripts/ingest_demo/tests/fixtures/m4e_wide_exif.json` (metadatos reales de una foto de Matrice 4E, con GPS y números de serie en cero o vacíos)
- Create: `scripts/ingest_demo/README.md`

**Interfaces:**
- `exif.read_exif(path: Path, exiftool: Path) -> dict` — `exiftool -j -n`; primer elemento.
- `exif.num(value) -> float | None` — acepta `'+102.977'`, `'-1.0'`, números y `None`.
- `gsd.compute_gsd(meta: dict, width_px: int) -> GsdResult | None`, con `GsdResult(mm_px: float, source: Literal["lrf","altitude","focus"], confidence: Literal["high","medium","low"])`.
  - **Distancia:**
    - `LRFTargetDistance` > 0 y `LRFStatus` distinto de `"Error"` → `lrf` / `high`;
    - si no, `RelativeAltitude / cos(GimbalPitchDegree)` (si el pitch es menor de 80°) → `altitude` / `medium`;
    - si no, `FocusDistance` → `focus` / `low`.
  - **Focal:**
    - `CalibratedFocalLength` (px) → `mm_px = distancia_m * 1000 / focal_px`;
    - si no, `distancia_mm * SENSOR_WIDTH_MM[modelo] / (FocalLength * width_px)` con `SENSOR_WIDTH_MM = {"M4E": 17.3, "M3E": 17.3}`;
    - sin modelo conocido → `None`.
  - Resultado fuera de [0.01, 100] → `None`.
- `media.sha256_file(path: Path) -> str`; `media.make_derivatives(src: Path, out_dir: Path) -> Derivatives(preview: Path, thumb: Path, width_px: int, height_px: int)`, con WebP calidad 80, lado mayor 2560 y 400.
- `manifest.object_prefix(org_id, project_id, inspection_id) -> str`.
- `manifest.build_manifest(project_id, inspection: dict, captures: list[dict], findings: list[dict] = []) -> dict` y `manifest.validate(m: dict) -> None`. Valida contra `src/contracts/ingest-manifest.v1.schema.json` (ruta relativa al repo).
- `upload.tus_upload(path: Path, object_name: str, content_type: str, *, supabase_url: str, access_token: str, publishable_key: str) -> None`:
  - endpoint `{supabase_url}/storage/v1/upload/resumable`, `chunk_size = 6 * 1024 * 1024`;
  - cabeceras `authorization: Bearer <token>`, `apikey`, `x-upsert: true`;
  - metadata `bucketName = inspection-media`, `objectName`, `contentType`, `cacheControl = 3600`.
- `cli`: `python -m ingest_demo --folder <ruta> --project <uuid> --asset <uuid> --email <correo> [--exiftool <ruta>]`.
  - Pide la contraseña con `getpass`. Recorre `Pala|Blade {A,B,C}/{TE,PS,LE,SS}/*.jpg`.
  - Usa un índice local `.ingest_index.json`, que guarda los `id` por `sha256` para que repetir sea idempotente.
  - Inicia sesión con la llave pública, sube por TUS y llama `rpc("ingest_manifest")`. Imprime el resultado o los errores de `detail`.

- [ ] **Step 1: Escribir las pruebas:**

```python
def test_num_parses_signed_strings():
    assert num("+102.977") == 102.977 and num("-1.0") == -1.0 and num(None) is None

def test_gsd_from_lrf_and_calibrated_focal():
    r = compute_gsd(load("m4e_wide_exif.json"), 5280)
    assert r.source == "lrf" and r.confidence == "high"
    assert r.mm_px == pytest.approx(3408 / 3725.151611, rel=1e-6)   # ≈ 0.9149 mm/px

def test_gsd_falls_back_to_altitude_without_lrf():
    m = load("m4e_wide_exif.json") | {"LRFTargetDistance": None, "LRFStatus": "Error"}
    r = compute_gsd(m, 5280)
    assert r.source == "altitude" and r.confidence == "medium"

def test_gsd_none_when_no_distance_and_unknown_model():
    assert compute_gsd({"Model": "XYZ"}, 4000) is None

def test_manifest_validates_and_paths_are_prefixed():
    m = build_manifest(PROJECT, INSPECTION, [CAPTURE])
    validate(m)
    assert m["captures"][0]["paths"]["original"].startswith(f"{ORG}/{PROJECT}/{INSPECTION['id']}/captures/")
```

- [ ] **Step 2: Run `cd scripts/ingest_demo && python -m venv .venv && .venv/Scripts/pip install -e .[dev] && .venv/Scripts/pytest -q`** → Expected: FAIL. Implementar. Run → PASS.
- [ ] **Step 3: Prueba real en local** con una carpeta de fotos DJI que indique el usuario (no se versiona):
  - `tecnico@nexus.local` sube a la inspección del seed.
  - Repetir el comando no duplica (`inserted = 0`).
  - La inspección aparece en `/admin/inspecciones/…` con sus miniaturas y en `/portal` para `gerente@cliente-a.local`, **no** para `gerente@cliente-b.local`.
- [ ] **Step 4: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 14: Portal de clientes (esqueleto de solo lectura)

**Files:**
- Create: `src/app/portal/layout.tsx` (diseño raíz, como `src/app/admin/layout.tsx`)
- Create: `src/app/portal/login/page.tsx`
- Create: `src/app/portal/page.tsx`
- Create: `src/app/portal/proyectos/[id]/page.tsx`
- Create: `src/app/portal/proyectos/[id]/inspecciones/[inspectionId]/page.tsx`
- Create: `src/components/inspections/portal/PortalHeader.tsx`

**Interfaces:**
- Consumes: `requireClient`, `assertInspectionsEnabled`, `LoginForm area="portal"`, `signPaths`, `CaptureGrid`.

- [ ] **Step 1: Páginas**
  - **Login:** «Portal de clientes».
  - **Inicio:** proyectos de las organizaciones del usuario, con nombre, sitio, estado y fechas. Si pertenece a varias, se agrupan por organización.
  - **Proyecto:** inspecciones con estado y número de fotos.
  - **Inspección:** `CaptureGrid` de solo lectura. Si la inspección no está `approved`, muestra la nota «En revisión por NEXUS».
  - **Sin funciones de edición.** La revisión y los comentarios del cliente llegan con el visor (fase 3).
- [ ] **Step 2: Verificar en el navegador:**
  - `gerente@cliente-a.local` ve solo los proyectos de A;
  - abrir a mano la URL de un proyecto de B muestra 404 (la consulta vuelve vacía por RLS);
  - un enlace firmado de A copiado a una sesión de B sigue funcionando solo hasta que caduca (1 h, comportamiento esperado y documentado).
- [ ] **Step 3: Run `npm run typecheck && npm run build`**; con `INSPECTIONS_ENABLED` vacío, `npm run build && npm run start`, y `/portal` y `/admin/inspecciones` responden 404.
- [ ] **Step 4: Checkpoint** — informar y **preguntar** si se hace commit.

---

### Task 15: Verificación final de la fase

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-inspecciones-fase1-base-design.md` (solo para marcar lo que haya cambiado durante la implementación)

- [ ] **Step 1:** Run `npx supabase db reset && npx supabase test db` → Expected: `00`–`07` en `ok`, cubriendo las 14 pruebas de §10.1.
- [ ] **Step 2:** Run `npm run test && npm run typecheck && npm run build` → Expected: sin errores.
- [ ] **Step 3:** Run `cd scripts/ingest_demo && .venv/Scripts/pytest -q` → Expected: PASS.
- [ ] **Step 4:** Recorrido de punta a punta (§10.2) con el script de la Tarea 13 y los usuarios del seed, revisando también Studio (`http://127.0.0.1:54323`) que las rutas de Storage siguen `{org}/{project}/{inspection}/…`.
- [ ] **Step 5:** Confirmar que nada tocó producción: `git diff --stat` solo muestra archivos del repo, y no se ejecutó ningún comando con `--linked` ni contra `swedqyjhepghtwrmzlth`.
- [ ] **Step 6: Checkpoint final** — resumir resultados y **preguntar** si se hace commit (y cuál). No hacer push.
