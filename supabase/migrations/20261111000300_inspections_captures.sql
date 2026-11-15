-- Capturas, datos de pala, térmicos y tiras unidas (§5 del diseño)

create type public.spectrum as enum ('rgb', 'thermal');
create type public.gsd_source as enum ('lrf', 'altitude', 'focus', 'manual', 'mosaic_calibration');
create type public.confidence_level as enum ('high', 'medium', 'low');
create type public.blade_position as enum ('A', 'B', 'C');
create type public.blade_face as enum ('TE', 'PS', 'LE', 'SS');
create type public.sequence_direction as enum ('root_to_tip', 'tip_to_root', 'unknown');
create type public.mosaic_kind as enum ('blade_strip');
create type public.mosaic_format as enum ('image', 'dzi');

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  spectrum public.spectrum not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text not null,
  sequence_index integer,
  original_path text not null,
  preview_path text,
  thumb_path text,
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  captured_at timestamptz,
  lat double precision,
  lon double precision,
  alt_abs_m numeric,
  alt_rel_m numeric,
  gimbal_pitch_deg numeric,
  gimbal_roll_deg numeric,
  gimbal_yaw_deg numeric,
  drone_model text,
  camera_model text,
  lrf_distance_m numeric,
  gsd_mm_px numeric check (gsd_mm_px > 0),
  gsd_source public.gsd_source,
  gsd_confidence public.confidence_level,
  paired_capture_id uuid references public.captures (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, sha256)
);
create index captures_project_idx on public.captures (project_id);
create index captures_paired_idx on public.captures (paired_capture_id);

create table public.blade_captures (
  capture_id uuid primary key references public.captures (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  blade public.blade_position not null,
  face public.blade_face not null,
  radius_center_m numeric,
  sequence_direction public.sequence_direction not null default 'unknown',
  chord_length_mm numeric
);
create index blade_captures_project_idx on public.blade_captures (project_id);

create table public.thermal_captures (
  capture_id uuid primary key references public.captures (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  matrix_path text,
  temp_scale numeric not null default 0.01,
  temp_offset numeric not null default -100,
  t_min_c numeric,
  t_max_c numeric,
  emissivity numeric,
  distance_m numeric,
  humidity_pct numeric,
  ambient_temp_c numeric,
  reflected_temp_c numeric
);
create index thermal_captures_project_idx on public.thermal_captures (project_id);

create table public.mosaics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  kind public.mosaic_kind not null,
  spectrum public.spectrum not null,
  blade public.blade_position,
  face public.blade_face,
  format public.mosaic_format not null default 'image',
  path text not null,
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  tip_row_px integer,
  root_row_px integer,
  blade_length_m numeric check (blade_length_m > 0),
  mm_per_px numeric check (mm_per_px > 0),
  root_at_top boolean,
  calibrated_by uuid references public.profiles (id) on delete set null,
  calibrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (inspection_id, kind, spectrum, blade, face)
);
create index mosaics_project_idx on public.mosaics (project_id);

create trigger captures_updated_at before update on public.captures
  for each row execute function private.set_updated_at();
create trigger mosaics_updated_at before update on public.mosaics
  for each row execute function private.set_updated_at();

-- FK diferida de la migración de catálogo
alter table public.inspections
  add constraint inspections_id_capture_fk
  foreign key (id_capture_id) references public.captures (id) on delete set null;

-- Funciones
create or replace function private.inspection_of_capture(c uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select inspection_id from public.captures where id = c;
$$;

-- Genérico: TG_ARGV[0] = tabla padre (public), TG_ARGV[1] = columna FK
create or replace function private.enforce_parent_project() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fk uuid;
  v_parent_project uuid;
begin
  v_fk := (to_jsonb(new) ->> tg_argv[1])::uuid;
  if v_fk is null then
    return new;
  end if;
  execute format('select project_id from public.%I where id = $1', tg_argv[0])
    into v_parent_project using v_fk;
  if v_parent_project is distinct from new.project_id then
    raise exception 'project_mismatch' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.guard_inspection_id_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id_capture_id is not null and not exists (
    select 1 from public.captures c where c.id = new.id_capture_id and c.inspection_id = new.id) then
    raise exception 'la captura de identificación debe ser de la misma inspección' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Pareja RGB/térmica: misma inspección y no la propia captura
create or replace function private.guard_capture_pair() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.paired_capture_id is null then
    return new;
  end if;
  if new.paired_capture_id = new.id or not exists (
    select 1 from public.captures c
    where c.id = new.paired_capture_id and c.inspection_id = new.inspection_id) then
    raise exception 'la captura emparejada debe ser otra de la misma inspección' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Genérico: TG_ARGV = columnas que no cambian después del insert
create or replace function private.forbid_parent_change() returns trigger
language plpgsql set search_path = '' as $$
declare
  c text;
begin
  foreach c in array tg_argv loop
    if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c then
      raise exception 'immutable_parent' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;

-- Funciones de trigger: sin permiso de ejecución directa
revoke execute on function
  private.enforce_parent_project(), private.guard_inspection_id_capture(),
  private.guard_capture_pair(), private.forbid_parent_change()
  from public, anon, authenticated;
revoke execute on function private.inspection_of_capture(uuid) from public, anon;
grant execute on function private.inspection_of_capture(uuid) to authenticated;

create trigger captures_parent_project before insert or update on public.captures
  for each row execute function private.enforce_parent_project('inspections', 'inspection_id');
create trigger captures_paired_project before insert or update on public.captures
  for each row execute function private.enforce_parent_project('captures', 'paired_capture_id');
create trigger captures_pair_guard before insert or update on public.captures
  for each row execute function private.guard_capture_pair();
create trigger captures_immutable_parent before update on public.captures
  for each row execute function private.forbid_parent_change('inspection_id', 'project_id');
create trigger blade_captures_immutable_parent before update on public.blade_captures
  for each row execute function private.forbid_parent_change('capture_id', 'project_id');
create trigger thermal_captures_immutable_parent before update on public.thermal_captures
  for each row execute function private.forbid_parent_change('capture_id', 'project_id');
create trigger mosaics_immutable_parent before update on public.mosaics
  for each row execute function private.forbid_parent_change('inspection_id', 'project_id');
create trigger blade_captures_parent_project before insert or update on public.blade_captures
  for each row execute function private.enforce_parent_project('captures', 'capture_id');
create trigger thermal_captures_parent_project before insert or update on public.thermal_captures
  for each row execute function private.enforce_parent_project('captures', 'capture_id');
create trigger mosaics_parent_project before insert or update on public.mosaics
  for each row execute function private.enforce_parent_project('inspections', 'inspection_id');
create trigger inspections_id_capture_guard before insert or update of id_capture_id on public.inspections
  for each row execute function private.guard_inspection_id_capture();

-- RLS (borrado: can_delete_inspection_data, sin la cuenta service)
alter table public.captures enable row level security;
alter table public.blade_captures enable row level security;
alter table public.thermal_captures enable row level security;
alter table public.mosaics enable row level security;

create policy captures_select on public.captures for select to authenticated
  using (private.can_read_project(project_id));
create policy captures_insert on public.captures for insert to authenticated
  with check (private.can_edit_inspection_data(project_id, inspection_id));
create policy captures_update on public.captures for update to authenticated
  using (private.can_edit_inspection_data(project_id, inspection_id))
  with check (private.can_edit_inspection_data(project_id, inspection_id));
create policy captures_delete on public.captures for delete to authenticated
  using (private.can_delete_inspection_data(project_id, inspection_id));

create policy blade_captures_select on public.blade_captures for select to authenticated
  using (private.can_read_project(project_id));
create policy blade_captures_insert on public.blade_captures for insert to authenticated
  with check (private.can_edit_inspection_data(project_id, private.inspection_of_capture(capture_id)));
create policy blade_captures_update on public.blade_captures for update to authenticated
  using (private.can_edit_inspection_data(project_id, private.inspection_of_capture(capture_id)))
  with check (private.can_edit_inspection_data(project_id, private.inspection_of_capture(capture_id)));
create policy blade_captures_delete on public.blade_captures for delete to authenticated
  using (private.can_delete_inspection_data(project_id, private.inspection_of_capture(capture_id)));

create policy thermal_captures_select on public.thermal_captures for select to authenticated
  using (private.can_read_project(project_id));
create policy thermal_captures_insert on public.thermal_captures for insert to authenticated
  with check (private.can_edit_inspection_data(project_id, private.inspection_of_capture(capture_id)));
create policy thermal_captures_update on public.thermal_captures for update to authenticated
  using (private.can_edit_inspection_data(project_id, private.inspection_of_capture(capture_id)))
  with check (private.can_edit_inspection_data(project_id, private.inspection_of_capture(capture_id)));
create policy thermal_captures_delete on public.thermal_captures for delete to authenticated
  using (private.can_delete_inspection_data(project_id, private.inspection_of_capture(capture_id)));

create policy mosaics_select on public.mosaics for select to authenticated
  using (private.can_read_project(project_id));
create policy mosaics_insert on public.mosaics for insert to authenticated
  with check (private.can_edit_inspection_data(project_id, inspection_id));
create policy mosaics_update on public.mosaics for update to authenticated
  using (private.can_edit_inspection_data(project_id, inspection_id))
  with check (private.can_edit_inspection_data(project_id, inspection_id));
create policy mosaics_delete on public.mosaics for delete to authenticated
  using (private.can_delete_inspection_data(project_id, inspection_id));

grant select, insert, update, delete on public.captures, public.blade_captures,
  public.thermal_captures, public.mosaics to authenticated;
