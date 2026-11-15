-- Daños, tipos de daño, comentarios y revisión del cliente (§6.1-6.4, 6.6 del diseño)

create type public.finding_status as enum ('detected', 'confirmed', 'dismissed');
create type public.finding_source as enum ('ai', 'manual');

create table public.finding_types (
  id uuid primary key default gen_random_uuid(),
  domain public.inspection_kind not null,
  code text not null,
  label_es text not null,
  label_en text not null,
  is_active boolean not null default true,
  unique (domain, code)
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  capture_id uuid references public.captures (id) on delete restrict,
  mosaic_id uuid references public.mosaics (id) on delete restrict,
  type_id uuid not null references public.finding_types (id) on delete restrict,
  severity smallint not null check (severity between 1 and 5),
  status public.finding_status not null default 'detected',
  client_reviewed_at timestamptz,
  client_reviewed_by uuid references public.profiles (id) on delete set null,
  region jsonb not null check (
    coalesce(jsonb_typeof(region -> 'points') = 'array' and region ->> 'type' in ('box', 'polygon'), false)),
  width_mm numeric,
  length_mm numeric,
  area_mm2 numeric,
  radius_m numeric,
  max_temp_c numeric,
  delta_t_c numeric,
  gsd_mm_px_used numeric,
  source public.finding_source not null default 'manual',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  ai_confidence numeric check (ai_confidence between 0 and 1),
  ai_model text,
  ai_model_version text,
  ai_original jsonb,
  corrected_at timestamptz,
  corrected_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((capture_id is not null) <> (mosaic_id is not null))
);
create index findings_project_idx on public.findings (project_id);
create index findings_inspection_idx on public.findings (inspection_id);
create index findings_capture_idx on public.findings (capture_id);
create index findings_mosaic_idx on public.findings (mosaic_id);
create index findings_type_idx on public.findings (type_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  finding_id uuid references public.findings (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  author_name text not null,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index comments_project_idx on public.comments (project_id);
create index comments_inspection_idx on public.comments (inspection_id);
create index comments_finding_idx on public.comments (finding_id);
create index comments_author_idx on public.comments (author_id);

-- Funciones de trigger
create or replace function private.guard_finding() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.capture_id is not null and not exists (
    select 1 from public.captures c where c.id = new.capture_id and c.inspection_id = new.inspection_id) then
    raise exception 'inspection_mismatch' using errcode = 'P0001';
  end if;
  if new.mosaic_id is not null and not exists (
    select 1 from public.mosaics m where m.id = new.mosaic_id and m.inspection_id = new.inspection_id) then
    raise exception 'inspection_mismatch' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.guard_finding_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ai_original is distinct from old.ai_original then
    raise exception 'ai_original_immutable' using errcode = 'P0001';
  end if;
  if current_setting('nexus.ingest', true) is distinct from 'on' and (
    new.type_id is distinct from old.type_id or new.severity is distinct from old.severity
    or new.status is distinct from old.status or new.region is distinct from old.region
    or new.width_mm is distinct from old.width_mm or new.length_mm is distinct from old.length_mm
    or new.area_mm2 is distinct from old.area_mm2 or new.radius_m is distinct from old.radius_m
    or new.max_temp_c is distinct from old.max_temp_c or new.delta_t_c is distinct from old.delta_t_c
    or new.gsd_mm_px_used is distinct from old.gsd_mm_px_used) then
    new.corrected_at := now();
    new.corrected_by := (select auth.uid());
  end if;
  return new;
end $$;

create or replace function private.guard_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(btrim(p.full_name), ''), p.email, '') into new.author_name
    from public.profiles p where p.id = new.author_id;
    new.author_name := coalesce(new.author_name, '');
    if new.finding_id is not null and not exists (
      select 1 from public.findings f where f.id = new.finding_id and f.inspection_id = new.inspection_id) then
      raise exception 'inspection_mismatch' using errcode = 'P0001';
    end if;
  else
    new.author_name := old.author_name;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end $$;

revoke execute on function private.guard_finding(), private.guard_finding_update(), private.guard_comment()
  from public, anon, authenticated;

create trigger findings_updated_at before update on public.findings
  for each row execute function private.set_updated_at();
create trigger findings_parent_inspection before insert or update on public.findings
  for each row execute function private.enforce_parent_project('inspections', 'inspection_id');
create trigger findings_parent_capture before insert or update on public.findings
  for each row execute function private.enforce_parent_project('captures', 'capture_id');
create trigger findings_parent_mosaic before insert or update on public.findings
  for each row execute function private.enforce_parent_project('mosaics', 'mosaic_id');
create trigger findings_guard before insert or update on public.findings
  for each row execute function private.guard_finding();
create trigger findings_immutable_parent before update on public.findings
  for each row execute function private.forbid_parent_change('project_id', 'inspection_id', 'capture_id', 'mosaic_id');
create trigger findings_guard_update before update on public.findings
  for each row execute function private.guard_finding_update();

create trigger comments_parent_inspection before insert or update on public.comments
  for each row execute function private.enforce_parent_project('inspections', 'inspection_id');
create trigger comments_parent_finding before insert or update on public.comments
  for each row execute function private.enforce_parent_project('findings', 'finding_id');
create trigger comments_immutable_parent before update on public.comments
  for each row execute function private.forbid_parent_change('project_id', 'inspection_id', 'finding_id');
create trigger comments_guard before insert or update on public.comments
  for each row execute function private.guard_comment();

-- RLS
alter table public.finding_types enable row level security;
alter table public.findings enable row level security;
alter table public.comments enable row level security;

create policy finding_types_select on public.finding_types for select to authenticated using (true);
create policy finding_types_insert on public.finding_types for insert to authenticated
  with check (private.is_admin());
create policy finding_types_update on public.finding_types for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy finding_types_delete on public.finding_types for delete to authenticated
  using (private.is_admin());

create policy findings_select on public.findings for select to authenticated
  using (private.can_read_project(project_id));
create policy findings_insert on public.findings for insert to authenticated
  with check (private.can_edit_inspection_data(project_id, inspection_id));
create policy findings_update on public.findings for update to authenticated
  using (private.can_edit_inspection_data(project_id, inspection_id))
  with check (private.can_edit_inspection_data(project_id, inspection_id));
create policy findings_delete on public.findings for delete to authenticated
  using (private.is_admin());

create policy comments_select on public.comments for select to authenticated
  using (private.can_read_project(project_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (private.can_comment_project(project_id) and author_id = (select auth.uid()));
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and private.can_read_project(project_id))
  with check (author_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using ((author_id = (select auth.uid()) and private.is_active_user()) or private.is_admin());

grant select, insert, update, delete on public.finding_types, public.findings, public.comments to authenticated;

-- Revisión del cliente
create or replace function public.mark_finding_reviewed(p_finding_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.findings where id = p_finding_id;
  if v_project is null
     or not private.is_org_member(private.org_of_project(v_project), array['client_manager']::public.org_member_role[]) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  update public.findings
    set client_reviewed_at = now(), client_reviewed_by = (select auth.uid())
    where id = p_finding_id;
end $$;
revoke execute on function public.mark_finding_reviewed(uuid) from public, anon;
grant execute on function public.mark_finding_reviewed(uuid) to authenticated;

-- Semilla
insert into public.finding_types (domain, code, label_es, label_en) values
  ('wind_blade', 'erosion_le', 'Erosión del borde de ataque', 'Leading edge erosion'),
  ('wind_blade', 'crack', 'Grieta', 'Crack'),
  ('wind_blade', 'delamination', 'Delaminación', 'Delamination'),
  ('wind_blade', 'lightning', 'Impacto de rayo', 'Lightning damage'),
  ('wind_blade', 'contamination', 'Contaminación', 'Contamination'),
  ('wind_blade', 'missing_paint', 'Pintura faltante', 'Missing paint'),
  ('wind_blade', 'other', 'Otro', 'Other');
