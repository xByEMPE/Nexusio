-- =============================================================================
-- NEXUS · Migración inicial
-- Multi-inquilino por organización · RBAC (admin, pilot, inspector, viewer)
-- Activos, misiones, vuelos, telemetría, media, reportes y hallazgos
-- PostGIS · Row-Level Security · Storage · Auditoría · Hook de JWT
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensiones y esquemas
-- -----------------------------------------------------------------------------
create extension if not exists postgis with schema extensions;

-- Esquema no expuesto por la Data API: funciones auxiliares de RLS y triggers.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. Tipos enumerados
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'pilot', 'inspector', 'viewer');
create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.asset_kind as enum (
  'transmission_tower', 'wind_turbine', 'solar_array', 'bridge', 'tailings_dam',
  'stockpile', 'pipeline', 'telecom_mast', 'substation', 'crop_field', 'other'
);
create type public.aircraft_status as enum ('active', 'maintenance', 'retired');
create type public.mission_type as enum (
  'area_mapping', 'corridor_mapping', 'structure_inspection', 'thermal_survey',
  'volumetric_survey', 'live_operation'
);
create type public.flight_status as enum ('planned', 'in_progress', 'completed', 'aborted');
create type public.media_kind as enum (
  'raw_image', 'raw_thermal', 'raw_video', 'orthomosaic', 'thermal_orthomosaic',
  'dsm', 'dtm', 'point_cloud', 'mesh', 'report_pdf', 'flight_log'
);
create type public.severity as enum ('info', 'minor', 'moderate', 'critical');
create type public.finding_status as enum ('detected', 'confirmed', 'dismissed', 'resolved');
create type public.finding_source as enum ('model', 'manual');
create type public.report_status as enum ('draft', 'in_review', 'approved', 'published', 'archived');

-- -----------------------------------------------------------------------------
-- 2. Utilidades genéricas
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Organizaciones (inquilinos), perfiles y membresías
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name               text not null check (char_length(name) between 2 and 160),
  -- Dominio corporativo para auto-alta vía SSO (p. ej. 'minera.cl').
  sso_domain         text unique check (sso_domain is null or sso_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  sso_default_role   public.app_role not null default 'viewer',
  require_mfa        boolean not null default true,
  data_region        text not null default 'sa-east-1',
  retention_raw_days integer not null default 730 check (retention_raw_days between 30 and 3650),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on column public.organizations.require_mfa is
  'Si es true, toda lectura/escritura exige sesión AAL2 (TOTP o WebAuthn verificado).';

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text check (char_length(full_name) <= 160),
  pilot_license       text check (char_length(pilot_license) <= 64),
  license_expires_on  date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.organization_members (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.app_role not null default 'viewer',
  status      public.membership_status not null default 'active',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
-- El PK cubre (org_id, ...); se indexa user_id para las búsquedas de RLS.
create index organization_members_user_idx on public.organization_members (user_id) include (org_id, role, status);
create index organization_members_invited_by_idx on public.organization_members (invited_by);

-- -----------------------------------------------------------------------------
-- 4. Funciones de autorización (SECURITY DEFINER, esquema privado)
--    Devuelven conjuntos de org_id NO correlacionados con la fila, de modo que
--    el planificador las evalúa una sola vez por consulta (hashed subplan).
--    Incorporan la exigencia de MFA: si la organización la requiere y la
--    sesión no es AAL2, la organización no se incluye.
-- -----------------------------------------------------------------------------
create or replace function private.org_ids_with_role(roles public.app_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and (roles is null or m.role = any (roles))
    and (not o.require_mfa or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2');
$$;

create or replace function private.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.org_ids_with_role(null::public.app_role[]);
$$;

revoke all on function private.org_ids_with_role(public.app_role[]) from public, anon;
revoke all on function private.member_org_ids() from public, anon;
-- Las políticas se evalúan con el rol del solicitante: requiere EXECUTE.
-- El esquema `private` no está expuesto en la Data API, por lo que no son invocables vía REST.
grant execute on function private.org_ids_with_role(public.app_role[]) to authenticated;
grant execute on function private.member_org_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Sitios y activos físicos
-- -----------------------------------------------------------------------------
create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  code        text not null check (char_length(code) between 1 and 40),
  name        text not null check (char_length(name) between 2 and 160),
  boundary    extensions.geography(MultiPolygon, 4326),
  timezone    text not null default 'America/Santiago',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, code)
);
create index sites_boundary_gix on public.sites using gist (boundary);

create table public.assets (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete set null,
  kind            public.asset_kind not null,
  code            text not null check (char_length(code) between 1 and 60),
  name            text not null check (char_length(name) between 1 and 200),
  -- Punto de referencia con altura elipsoidal (m).
  location        extensions.geography(PointZ, 4326),
  -- Geometría completa opcional: traza de línea, polígono de parque, etc.
  footprint       extensions.geography(Geometry, 4326),
  criticality     smallint not null default 3 check (criticality between 1 and 5),
  commissioned_on date,
  attributes      jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, code)
);
create index assets_site_idx on public.assets (site_id);
create index assets_org_kind_idx on public.assets (org_id, kind);
create index assets_location_gix on public.assets using gist (location);
create index assets_footprint_gix on public.assets using gist (footprint);
create index assets_attributes_gin on public.assets using gin (attributes jsonb_path_ops);

-- -----------------------------------------------------------------------------
-- 6. Flota, misiones y vuelos
-- -----------------------------------------------------------------------------
create table public.aircraft (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  serial_number  text not null unique check (serial_number ~ '^[A-Z0-9]{8,32}$'),
  model          text not null,
  callsign       text not null,
  dock_serial    text check (dock_serial is null or dock_serial ~ '^[A-Z0-9]{8,32}$'),
  firmware       text,
  status         public.aircraft_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, callsign)
);

create table public.missions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  site_id        uuid references public.sites (id) on delete set null,
  name           text not null check (char_length(name) between 2 and 200),
  mission_type   public.mission_type not null,
  planned_route  extensions.geography(LineStringZ, 4326),
  -- Ruta WPML/KMZ en Storage (bucket raw-captures o missions).
  wpml_path      text,
  -- Parámetros: altitud, solape frontal/lateral, GSD objetivo, velocidad.
  parameters     jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index missions_org_idx on public.missions (org_id, created_at desc);
create index missions_site_idx on public.missions (site_id);
create index missions_created_by_idx on public.missions (created_by);
create index missions_route_gix on public.missions using gist (planned_route);

create table public.mission_assets (
  mission_id  uuid not null references public.missions (id) on delete cascade,
  asset_id    uuid not null references public.assets (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  sequence    integer not null default 0,
  primary key (mission_id, asset_id)
);
create index mission_assets_asset_idx on public.mission_assets (asset_id);
create index mission_assets_org_idx on public.mission_assets (org_id);

create table public.flights (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  mission_id         uuid references public.missions (id) on delete set null,
  aircraft_id        uuid not null references public.aircraft (id) on delete restrict,
  pilot_id           uuid references auth.users (id) on delete set null,
  status             public.flight_status not null default 'planned',
  scheduled_for      timestamptz,
  started_at         timestamptz,
  ended_at           timestamptz,
  takeoff_point      extensions.geography(PointZ, 4326),
  flown_path         extensions.geography(LineStringZ, 4326),
  max_altitude_agl_m numeric(7, 2) check (max_altitude_agl_m >= 0),
  distance_m         numeric(10, 2) check (distance_m >= 0),
  authorization_ref  text,
  weather            jsonb check (weather is null or jsonb_typeof(weather) = 'object'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);
create index flights_org_started_idx on public.flights (org_id, started_at desc);
create index flights_mission_idx on public.flights (mission_id);
create index flights_aircraft_idx on public.flights (aircraft_id);
create index flights_pilot_idx on public.flights (pilot_id);
create index flights_path_gix on public.flights using gist (flown_path);
create index flights_active_idx on public.flights (org_id) where status = 'in_progress';

-- Telemetría de alta frecuencia, particionada por mes.
create table public.flight_telemetry (
  flight_id      uuid not null references public.flights (id) on delete cascade,
  org_id         uuid not null references public.organizations (id) on delete cascade,
  recorded_at    timestamptz not null,
  seq            integer not null,
  position       extensions.geography(PointZ, 4326) not null,
  altitude_agl_m real,
  ground_speed   real,
  vertical_speed real,
  pitch          real,
  roll           real,
  yaw            real,
  battery_pct    real check (battery_pct between 0 and 100),
  rtk_fix        text check (rtk_fix in ('none', 'float', 'fixed')),
  link_quality   smallint check (link_quality between 0 and 5),
  primary key (flight_id, recorded_at, seq)
) partition by range (recorded_at);

create index flight_telemetry_org_time_idx on public.flight_telemetry (org_id, recorded_at desc);

create or replace function private.ensure_telemetry_partition(month_start date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  part_name text := format('flight_telemetry_%s', to_char(month_start, 'YYYY_MM'));
begin
  execute format(
    'create table if not exists public.%I partition of public.flight_telemetry for values from (%L) to (%L)',
    part_name, month_start, (month_start + interval '1 month')::date
  );
  -- Las particiones son tablas accesibles por separado: se bloquean para que
  -- el único camino sea la tabla padre, donde aplican las políticas RLS.
  execute format('alter table public.%I enable row level security', part_name);
  execute format('revoke all on table public.%I from anon, authenticated', part_name);
end;
$$;
revoke all on function private.ensure_telemetry_partition(date) from public, anon, authenticated;

select private.ensure_telemetry_partition(date_trunc('month', now())::date);
select private.ensure_telemetry_partition((date_trunc('month', now()) + interval '1 month')::date);
create table public.flight_telemetry_default partition of public.flight_telemetry default;
alter table public.flight_telemetry_default enable row level security;
revoke all on table public.flight_telemetry_default from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Media capturada y entregables (metadatos; los binarios viven en Storage)
-- -----------------------------------------------------------------------------
create table public.media_assets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  flight_id      uuid references public.flights (id) on delete set null,
  asset_id       uuid references public.assets (id) on delete set null,
  kind           public.media_kind not null,
  bucket_id      text not null,
  object_path    text not null,
  -- Cadena de custodia: hash del binario calculado en origen.
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes          bigint not null check (bytes > 0),
  mime_type      text not null,
  captured_at    timestamptz,
  capture_point  extensions.geography(PointZ, 4326),
  sensor         text,
  gimbal_pitch   real,
  gsd_cm_px      real check (gsd_cm_px > 0),
  metadata       jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  uploaded_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (bucket_id, object_path),
  -- La ruta debe comenzar por el org_id: coincide con las políticas de Storage.
  check (split_part(object_path, '/', 1) = org_id::text)
);
create index media_assets_org_kind_idx on public.media_assets (org_id, kind, captured_at desc);
create index media_assets_flight_idx on public.media_assets (flight_id);
create index media_assets_asset_idx on public.media_assets (asset_id);
create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);
create index media_assets_point_gix on public.media_assets using gist (capture_point);

create or replace function private.media_custody_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sha256 is distinct from old.sha256
     or new.object_path is distinct from old.object_path
     or new.bucket_id is distinct from old.bucket_id
     or new.bytes is distinct from old.bytes
     or new.org_id is distinct from old.org_id then
    raise exception 'media_assets: hash, ruta, tamaño y organización son inmutables'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger media_assets_custody
  before update on public.media_assets
  for each row execute function private.media_custody_guard();

-- -----------------------------------------------------------------------------
-- 8. Reportes de inspección y hallazgos estructurados
-- -----------------------------------------------------------------------------
create table public.inspection_reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  site_id       uuid references public.sites (id) on delete set null,
  title         text not null check (char_length(title) between 3 and 200),
  period_start  date,
  period_end    date,
  status        public.report_status not null default 'draft',
  summary       text,
  pdf_path      text,
  created_by    uuid references auth.users (id) on delete set null,
  approved_by   uuid references auth.users (id) on delete set null,
  approved_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (status <> 'published' or published_at is not null),
  check (status not in ('approved', 'published') or approved_by is not null)
);
create index inspection_reports_org_status_idx on public.inspection_reports (org_id, status, published_at desc);
create index inspection_reports_site_idx on public.inspection_reports (site_id);
create index inspection_reports_created_by_idx on public.inspection_reports (created_by);
create index inspection_reports_approved_by_idx on public.inspection_reports (approved_by);

create table public.findings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  asset_id         uuid not null references public.assets (id) on delete cascade,
  report_id        uuid references public.inspection_reports (id) on delete set null,
  flight_id        uuid references public.flights (id) on delete set null,
  media_id         uuid references public.media_assets (id) on delete set null,
  code             text not null check (code ~ '^[A-Z]{2,6}-[A-Z0-9]{2,12}$'),
  title            text not null check (char_length(title) between 3 and 200),
  component        text,
  severity         public.severity not null,
  status           public.finding_status not null default 'detected',
  source           public.finding_source not null default 'model',
  confidence       numeric(4, 3) check (confidence between 0 and 1),
  model_version    text,
  -- Caja normalizada {x,y,w,h} en [0,1] sobre la imagen de origen.
  bbox             jsonb check (
                     bbox is null or (
                       jsonb_typeof(bbox) = 'object'
                       and (bbox ->> 'x')::numeric between 0 and 1
                       and (bbox ->> 'y')::numeric between 0 and 1
                       and (bbox ->> 'w')::numeric between 0 and 1
                       and (bbox ->> 'h')::numeric between 0 and 1
                     )
                   ),
  location         extensions.geography(PointZ, 4326),
  measurement      numeric(12, 3),
  measurement_unit text,
  work_order_ref   text,
  detected_at      timestamptz not null default now(),
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (source <> 'model' or (confidence is not null and model_version is not null)),
  check (status = 'detected' or (reviewed_by is not null and reviewed_at is not null))
);
create index findings_org_status_idx on public.findings (org_id, status, severity);
create index findings_asset_idx on public.findings (asset_id, detected_at desc);
create index findings_report_idx on public.findings (report_id);
create index findings_flight_idx on public.findings (flight_id);
create index findings_media_idx on public.findings (media_id);
create index findings_reviewed_by_idx on public.findings (reviewed_by);
create index findings_location_gix on public.findings using gist (location);
-- Cola de revisión: detecciones abiertas, la consulta más frecuente del inspector.
create index findings_review_queue_idx on public.findings (org_id, severity, detected_at)
  where status = 'detected';

-- -----------------------------------------------------------------------------
-- 9. Auditoría inmutable
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  -- Sin FK: el registro debe sobrevivir a la eliminación de la organización.
  org_id      uuid,
  actor_id    uuid,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  at          timestamptz not null default now()
);
create index audit_log_org_at_idx on public.audit_log (org_id, at desc);

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (org_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    (rec ->> 'org_id')::uuid,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'user_id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;
revoke all on function private.audit_row() from public, anon, authenticated;

create or replace function private.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log es de solo inserción' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

-- -----------------------------------------------------------------------------
-- 10. Solicitudes de evaluación técnica (formulario público de la landing)
--     Solo escribe el route handler con la clave secreta; sin acceso anon.
-- -----------------------------------------------------------------------------
create table public.assessment_requests (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique default (
                         'NX-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' ||
                         upper(substr(md5(gen_random_uuid()::text), 1, 5))
                       ),
  industry             text not null,
  services             text[] not null check (
                         cardinality(services) between 1 and 4
                         and services <@ array['dji_app', 'project_platform', 'website', 'undecided']
                       ),
  project_summary      text not null check (char_length(project_summary) between 20 and 2000),
  fleet_size           text not null check (fleet_size in ('none', '1-3', '4-10', '11-30', '30+')),
  aircraft_models      text check (char_length(aircraft_models) <= 300),
  hosting              text not null check (hosting in ('cloud', 'on_premise', 'undecided')),
  objectives           text[] not null check (cardinality(objectives) between 1 and 10),
  timeline             text not null check (timeline in ('lt_3m', '3_6m', '6_12m', 'exploratory')),
  full_name            text not null check (char_length(full_name) between 3 and 120),
  role_title           text not null check (char_length(role_title) between 2 and 120),
  company              text not null check (char_length(company) between 2 and 160),
  email                text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  country              text not null check (char_length(country) between 2 and 80),
  consent_at           timestamptz not null,
  trace_id             text,
  source_ip_hash       text check (source_ip_hash ~ '^[0-9a-f]{64}$'),
  triage_status        text not null default 'new' check (triage_status in ('new', 'qualified', 'contacted', 'closed')),
  created_at           timestamptz not null default now()
);
create index assessment_requests_created_idx on public.assessment_requests (created_at desc);
create index assessment_requests_ip_idx on public.assessment_requests (source_ip_hash, created_at desc);

-- -----------------------------------------------------------------------------
-- 11. Triggers de updated_at y auditoría
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'organization_members', 'sites', 'assets', 'aircraft',
    'missions', 'flights', 'inspection_reports', 'findings'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      t || '_updated_at', t
    );
  end loop;

  foreach t in array array[
    'organization_members', 'assets', 'flights', 'media_assets', 'inspection_reports', 'findings'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Integridad de membresías y flujos de negocio
-- -----------------------------------------------------------------------------

-- Impide dejar una organización sin administradores activos.
create or replace function private.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  remaining integer;
begin
  -- Borrado en cascada de la organización completa: no aplica la regla.
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return coalesce(new, old);
  end if;
  if (tg_op = 'DELETE' and old.role = 'admin' and old.status = 'active')
     or (tg_op = 'UPDATE' and old.role = 'admin' and old.status = 'active'
         and (new.role <> 'admin' or new.status <> 'active')) then
    select count(*) into remaining
    from public.organization_members
    where org_id = old.org_id and role = 'admin' and status = 'active' and user_id <> old.user_id;
    if remaining = 0 then
      raise exception 'La organización debe conservar al menos un administrador activo'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organization_members_last_admin
  before update or delete on public.organization_members
  for each row execute function private.guard_last_admin();

-- Las filas hijas deben pertenecer a la misma organización que sus padres.
create or replace function private.enforce_same_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'findings' then
    if not exists (select 1 from public.assets a where a.id = new.asset_id and a.org_id = new.org_id)
       or (new.report_id is not null and not exists (
             select 1 from public.inspection_reports r where r.id = new.report_id and r.org_id = new.org_id))
       or (new.media_id is not null and not exists (
             select 1 from public.media_assets m where m.id = new.media_id and m.org_id = new.org_id)) then
      raise exception 'findings: referencias de otra organización' using errcode = 'foreign_key_violation';
    end if;
  elsif tg_table_name = 'flights' then
    if not exists (select 1 from public.aircraft a where a.id = new.aircraft_id and a.org_id = new.org_id)
       or (new.mission_id is not null and not exists (
             select 1 from public.missions m where m.id = new.mission_id and m.org_id = new.org_id)) then
      raise exception 'flights: referencias de otra organización' using errcode = 'foreign_key_violation';
    end if;
  elsif tg_table_name = 'mission_assets' then
    if not exists (select 1 from public.missions m where m.id = new.mission_id and m.org_id = new.org_id)
       or not exists (select 1 from public.assets a where a.id = new.asset_id and a.org_id = new.org_id) then
      raise exception 'mission_assets: referencias de otra organización' using errcode = 'foreign_key_violation';
    end if;
  elsif tg_table_name = 'media_assets' then
    if new.flight_id is not null and not exists (
         select 1 from public.flights f where f.id = new.flight_id and f.org_id = new.org_id) then
      raise exception 'media_assets: vuelo de otra organización' using errcode = 'foreign_key_violation';
    end if;
  elsif tg_table_name = 'flight_telemetry' then
    if not exists (select 1 from public.flights f where f.id = new.flight_id and f.org_id = new.org_id) then
      raise exception 'flight_telemetry: vuelo de otra organización' using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger findings_same_org before insert or update on public.findings
  for each row execute function private.enforce_same_org();
create trigger flights_same_org before insert or update on public.flights
  for each row execute function private.enforce_same_org();
create trigger mission_assets_same_org before insert or update on public.mission_assets
  for each row execute function private.enforce_same_org();
create trigger media_assets_same_org before insert on public.media_assets
  for each row execute function private.enforce_same_org();
create trigger flight_telemetry_same_org before insert on public.flight_telemetry
  for each row execute function private.enforce_same_org();

-- Revisión de hallazgos: registra revisor y momento al salir de 'detected'.
create or replace function private.stamp_finding_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'detected' and (old is null or old.status is distinct from new.status) then
    new.reviewed_by := coalesce((select auth.uid()), new.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger findings_review_stamp before insert or update of status on public.findings
  for each row execute function private.stamp_finding_review();

-- Publicación de reportes: sella aprobador y fechas según la transición.
create or replace function private.stamp_report_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('approved', 'published') and old.status not in ('approved', 'published') then
    new.approved_by := coalesce((select auth.uid()), new.approved_by);
    new.approved_at := now();
  end if;
  if new.status = 'published' and old.status <> 'published' then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger inspection_reports_status_stamp before update of status on public.inspection_reports
  for each row execute function private.stamp_report_status();

-- -----------------------------------------------------------------------------
-- 13. Alta de usuarios: perfil + auto-unión por dominio SSO
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  domain text := lower(split_part(new.email, '@', 2));
  org    public.organizations%rowtype;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  -- Solo identidades federadas (SAML SSO) se unen automáticamente.
  if coalesce(new.raw_app_meta_data ->> 'provider', '') like 'sso:%' and domain <> '' then
    select * into org from public.organizations where sso_domain = domain;
    if found then
      insert into public.organization_members (org_id, user_id, role, status)
      values (org.id, new.id, org.sso_default_role, 'active')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- RPC: crear organización y quedar como su administrador.
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  new_id uuid;
begin
  if uid is null then
    raise exception 'Requiere sesión autenticada' using errcode = 'insufficient_privilege';
  end if;
  if coalesce((select auth.jwt() ->> 'aal'), 'aal1') <> 'aal2' then
    raise exception 'Crear una organización requiere MFA verificada (AAL2)' using errcode = 'insufficient_privilege';
  end if;
  insert into public.organizations (name, slug) values (p_name, p_slug) returning id into new_id;
  insert into public.organization_members (org_id, user_id, role, status) values (new_id, uid, 'admin', 'active');
  return new_id;
end;
$$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 14. Row-Level Security
--     Patrón: org_id IN (select private.org_ids_with_role(...)) — subconsulta
--     no correlacionada, evaluada una vez por sentencia.
-- -----------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.organization_members enable row level security;
alter table public.sites                enable row level security;
alter table public.assets               enable row level security;
alter table public.aircraft             enable row level security;
alter table public.missions             enable row level security;
alter table public.mission_assets       enable row level security;
alter table public.flights              enable row level security;
alter table public.flight_telemetry     enable row level security;
alter table public.media_assets         enable row level security;
alter table public.inspection_reports   enable row level security;
alter table public.findings             enable row level security;
alter table public.audit_log            enable row level security;
alter table public.assessment_requests  enable row level security;

-- Organizaciones
create policy organizations_select on public.organizations for select to authenticated
  using (id in (select private.member_org_ids()));
create policy organizations_update on public.organizations for update to authenticated
  using (id in (select private.org_ids_with_role(array['admin']::public.app_role[])))
  with check (id in (select private.org_ids_with_role(array['admin']::public.app_role[])));

-- Perfiles: el propio, y los de compañeros de organización (solo lectura).
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.organization_members m
      where m.org_id in (select private.member_org_ids())
    )
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Membresías
create policy members_select on public.organization_members for select to authenticated
  using (org_id in (select private.member_org_ids()));
create policy members_insert_admin on public.organization_members for insert to authenticated
  with check (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])));
create policy members_update_admin on public.organization_members for update to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])));
create policy members_delete_admin on public.organization_members for delete to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])));

-- Sitios y activos: lectura para todos los miembros; escritura admin/inspector.
create policy sites_select on public.sites for select to authenticated
  using (org_id in (select private.member_org_ids()));
create policy sites_write on public.sites for all to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])));

create policy assets_select on public.assets for select to authenticated
  using (org_id in (select private.member_org_ids()));
create policy assets_write on public.assets for all to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])));

-- Flota: lectura operativa (no viewer); gestión admin.
create policy aircraft_select on public.aircraft for select to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[])));
create policy aircraft_write on public.aircraft for all to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])));

-- Misiones y vuelos: lectura operativa; planificación/ejecución admin/pilot.
create policy missions_select on public.missions for select to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[])));
create policy missions_write on public.missions for all to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'pilot']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin', 'pilot']::public.app_role[])));

create policy mission_assets_select on public.mission_assets for select to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[])));
create policy mission_assets_write on public.mission_assets for all to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'pilot']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin', 'pilot']::public.app_role[])));

create policy flights_select on public.flights for select to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[])));
create policy flights_insert on public.flights for insert to authenticated
  with check (org_id in (select private.org_ids_with_role(array['admin', 'pilot']::public.app_role[])));
-- Un piloto solo modifica sus propios vuelos; el admin, cualquiera.
create policy flights_update on public.flights for update to authenticated
  using (
    org_id in (select private.org_ids_with_role(array['admin']::public.app_role[]))
    or (pilot_id = (select auth.uid()) and org_id in (select private.org_ids_with_role(array['pilot']::public.app_role[])))
  )
  with check (org_id in (select private.org_ids_with_role(array['admin', 'pilot']::public.app_role[])));
create policy flights_delete on public.flights for delete to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])));

create policy telemetry_select on public.flight_telemetry for select to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[])));
create policy telemetry_insert on public.flight_telemetry for insert to authenticated
  with check (org_id in (select private.org_ids_with_role(array['admin', 'pilot']::public.app_role[])));

-- Media: RAW visible para roles operativos; entregables también para viewer.
create policy media_select on public.media_assets for select to authenticated
  using (
    org_id in (select private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[]))
    or (
      kind in ('orthomosaic', 'thermal_orthomosaic', 'dsm', 'dtm', 'point_cloud', 'mesh', 'report_pdf')
      and org_id in (select private.org_ids_with_role(array['viewer']::public.app_role[]))
    )
  );
create policy media_insert on public.media_assets for insert to authenticated
  with check (
    org_id in (select private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[]))
    and uploaded_by = (select auth.uid())
  );
create policy media_update on public.media_assets for update to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])));
create policy media_delete on public.media_assets for delete to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])));

-- Reportes: borradores para admin/inspector/pilot; publicados para todos.
create policy reports_select on public.inspection_reports for select to authenticated
  using (
    org_id in (select private.org_ids_with_role(array['admin', 'inspector', 'pilot']::public.app_role[]))
    or (status = 'published' and org_id in (select private.member_org_ids()))
  );
create policy reports_write on public.inspection_reports for all to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])));

-- Hallazgos: el viewer solo ve los asociados a reportes publicados.
create policy findings_select on public.findings for select to authenticated
  using (
    org_id in (select private.org_ids_with_role(array['admin', 'inspector', 'pilot']::public.app_role[]))
    or report_id in (
      select r.id from public.inspection_reports r
      where r.status = 'published' and r.org_id in (select private.member_org_ids())
    )
  );
create policy findings_write on public.findings for all to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])))
  with check (org_id in (select private.org_ids_with_role(array['admin', 'inspector']::public.app_role[])));

-- Auditoría: lectura exclusiva de administradores; la escritura es solo por trigger.
create policy audit_select_admin on public.audit_log for select to authenticated
  using (org_id in (select private.org_ids_with_role(array['admin']::public.app_role[])));

-- assessment_requests: RLS activa y sin políticas ⇒ solo service_role.

-- Defensa en profundidad: anon no tiene privilegios sobre tablas de dominio.
revoke all on all tables in schema public from anon;
revoke all on public.assessment_requests from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;

-- -----------------------------------------------------------------------------
-- 15. Custom Access Token Hook: incluye organizaciones y roles en el JWT
--     (para la UI; RLS siempre consulta las tablas para reflejar revocaciones).
--     Activar en Dashboard › Authentication › Hooks o en config.toml.
-- -----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  orgs   jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('org_id', m.org_id, 'role', m.role)), '[]'::jsonb)
    into orgs
  from public.organization_members m
  where m.user_id = (event ->> 'user_id')::uuid and m.status = 'active';

  claims := jsonb_set(
    claims, '{app_metadata}',
    coalesce(claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object('orgs', orgs)
  );
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant select on public.organization_members to supabase_auth_admin;
create policy members_read_auth_hook on public.organization_members for select to supabase_auth_admin
  using (true);

-- -----------------------------------------------------------------------------
-- 16. Storage: buckets privados y políticas por organización
--     Convención de ruta: {org_id}/{flight_id|site_id}/{archivo}
--     El acceso a binarios es siempre mediante URLs firmadas de vida corta
--     (createSignedUrl), que exigen permiso SELECT sobre el objeto.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('raw-captures', 'raw-captures', false, 524288000,
    array['image/jpeg', 'image/tiff', 'image/x-adobe-dng', 'video/mp4', 'application/octet-stream',
          'application/vnd.google-earth.kmz', 'text/csv', 'application/json']),
  ('thermal', 'thermal', false, 524288000,
    array['image/jpeg', 'image/tiff', 'application/octet-stream']),
  ('orthomosaics', 'orthomosaics', false, 21474836480,
    array['image/tiff', 'image/png', 'image/jpeg', 'application/octet-stream']),
  ('point-clouds', 'point-clouds', false, 53687091200,
    array['application/octet-stream', 'application/vnd.laszip', 'application/json', 'model/gltf-binary']),
  ('reports', 'reports', false, 104857600,
    array['application/pdf', 'application/json', 'text/csv'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lectura RAW (raw-captures, thermal): roles operativos.
create policy storage_raw_select on storage.objects for select to authenticated
  using (
    bucket_id in ('raw-captures', 'thermal')
    and (storage.foldername(name))[1] in (
      select o::text from private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[]) o
    )
  );

-- Lectura de entregables (orthomosaics, point-clouds, reports): todos los miembros.
create policy storage_deliverables_select on storage.objects for select to authenticated
  using (
    bucket_id in ('orthomosaics', 'point-clouds', 'reports')
    and (storage.foldername(name))[1] in (select o::text from private.member_org_ids() o)
  );

-- Carga RAW: admin, piloto, inspector.
create policy storage_raw_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('raw-captures', 'thermal')
    and (storage.foldername(name))[1] in (
      select o::text from private.org_ids_with_role(array['admin', 'pilot', 'inspector']::public.app_role[]) o
    )
  );

-- Carga de entregables: admin, inspector (los workers usan service_role).
create policy storage_deliverables_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('orthomosaics', 'point-clouds', 'reports')
    and (storage.foldername(name))[1] in (
      select o::text from private.org_ids_with_role(array['admin', 'inspector']::public.app_role[]) o
    )
  );

-- Sobrescritura y borrado: solo admin (preserva la cadena de custodia).
create policy storage_admin_update on storage.objects for update to authenticated
  using (
    bucket_id in ('raw-captures', 'thermal', 'orthomosaics', 'point-clouds', 'reports')
    and (storage.foldername(name))[1] in (
      select o::text from private.org_ids_with_role(array['admin']::public.app_role[]) o
    )
  );
create policy storage_admin_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('raw-captures', 'thermal', 'orthomosaics', 'point-clouds', 'reports')
    and (storage.foldername(name))[1] in (
      select o::text from private.org_ids_with_role(array['admin']::public.app_role[]) o
    )
  );
