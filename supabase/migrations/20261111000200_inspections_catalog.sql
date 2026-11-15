-- Catálogo, proyectos, asignaciones e inspecciones.

create type public.site_kind as enum ('wind_farm', 'solar_plant', 'transmission_line');
create type public.asset_kind as enum ('wind_turbine', 'solar_block', 'transmission_tower', 'transmission_span');
create type public.project_status as enum ('planned', 'in_field', 'processing', 'in_review', 'delivered', 'archived');
create type public.inspection_kind as enum ('wind_blade', 'solar', 'transmission');
create type public.inspection_status as enum ('pending', 'captured', 'processing', 'in_review', 'approved');

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind public.site_kind not null,
  name text not null,
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  site_id uuid not null references public.sites (id) on delete restrict,
  kind public.asset_kind not null,
  name text not null,
  code text,
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, name)
);
create index assets_org_idx on public.assets (organization_id);

create table public.wind_turbine_specs (
  asset_id uuid primary key references public.assets (id) on delete cascade,
  manufacturer text,
  model text,
  blade_length_m numeric check (blade_length_m > 0),
  rotor_diameter_m numeric check (rotor_diameter_m > 0),
  hub_height_m numeric check (hub_height_m > 0),
  wtgm jsonb
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null,
  code text,
  status public.project_status not null default 'planned',
  start_date date,
  end_date date,
  contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(contacts) = 'array'),
  notes text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_org_idx on public.projects (organization_id);

create table public.project_sites (
  project_id uuid not null references public.projects (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete restrict,
  primary key (project_id, site_id)
);
create index project_sites_site_idx on public.project_sites (site_id);

create table public.project_assignments (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid default auth.uid() references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_assignments_user_idx on public.project_assignments (user_id);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  asset_id uuid not null references public.assets (id) on delete restrict,
  kind public.inspection_kind not null,
  status public.inspection_status not null default 'pending',
  inspected_at timestamptz,
  pilot_name text,
  assistant_name text,
  drone_model text,
  id_capture_id uuid, -- FK a captures se agrega en la migración de capturas
  blade_length_m numeric check (blade_length_m > 0),
  notes text,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, asset_id, kind)
);
create index inspections_asset_idx on public.inspections (asset_id);

create trigger sites_updated_at before update on public.sites
  for each row execute function private.set_updated_at();
create trigger assets_updated_at before update on public.assets
  for each row execute function private.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger inspections_updated_at before update on public.inspections
  for each row execute function private.set_updated_at();

-- Funciones de permiso (exigen perfil activo)
create or replace function private.is_assigned(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_assignments a
    join public.profiles pr on pr.id = a.user_id
    where a.project_id = p and a.user_id = (select auth.uid()) and pr.is_active
      and pr.platform_role in ('technician', 'service'));
$$;

create or replace function private.org_of_project(p uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select pj.organization_id from public.projects pj where pj.id = p and private.is_active_user();
$$;

create or replace function private.can_read_org(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_org_member(o) or exists (
    select 1 from public.project_assignments a
    join public.projects pj on pj.id = a.project_id
    join public.profiles pr on pr.id = a.user_id
    where a.user_id = (select auth.uid()) and pr.is_active
      and pr.platform_role in ('technician', 'service') and pj.organization_id = o);
$$;

create or replace function private.can_read_project(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_assigned(p)
    or private.is_org_member(private.org_of_project(p));
$$;

create or replace function private.can_write_project(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from public.project_assignments a
    join public.profiles pr on pr.id = a.user_id
    where a.project_id = p and a.user_id = (select auth.uid()) and pr.is_active
      and pr.platform_role in ('technician', 'service'));
$$;

create or replace function private.can_comment_project(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from public.project_assignments a
    join public.profiles pr on pr.id = a.user_id
    where a.project_id = p and a.user_id = (select auth.uid()) and pr.is_active
      and pr.platform_role = 'technician')
    or private.is_org_member(private.org_of_project(p), array['client_manager']::public.org_member_role[]);
$$;

create or replace function private.inspection_is_locked(i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.inspections n where n.id = i and n.status = 'approved');
$$;

create or replace function private.can_edit_inspection_data(p uuid, i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_write_project(p) and (not private.inspection_is_locked(i) or private.is_admin());
$$;

-- Borrado de datos de inspección: admin, o técnico asignado y activo con la inspección sin bloquear.
-- La cuenta service no borra (§6).
create or replace function private.can_delete_inspection_data(p uuid, i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or (
    exists (
      select 1 from public.project_assignments a
      join public.profiles pr on pr.id = a.user_id
      where a.project_id = p and a.user_id = (select auth.uid()) and pr.is_active
        and pr.platform_role = 'technician')
    and not private.inspection_is_locked(i));
$$;

revoke execute on function
  private.is_assigned(uuid), private.org_of_project(uuid), private.can_read_org(uuid),
  private.can_read_project(uuid), private.can_write_project(uuid), private.can_comment_project(uuid),
  private.inspection_is_locked(uuid), private.can_edit_inspection_data(uuid, uuid),
  private.can_delete_inspection_data(uuid, uuid)
  from public, anon;
grant execute on function
  private.is_assigned(uuid), private.org_of_project(uuid), private.can_read_org(uuid),
  private.can_read_project(uuid), private.can_write_project(uuid), private.can_comment_project(uuid),
  private.inspection_is_locked(uuid), private.can_edit_inspection_data(uuid, uuid),
  private.can_delete_inspection_data(uuid, uuid)
  to authenticated;

-- Triggers de coherencia (todos P0001)
create or replace function private.guard_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id
     and exists (select 1 from public.inspections i where i.asset_id = old.id) then
    raise exception 'un activo con inspecciones no puede cambiar de organización' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.sites s where s.id = new.site_id and s.organization_id = new.organization_id) then
    raise exception 'el activo debe pertenecer a la misma organización que su sitio' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger assets_guard before insert or update of organization_id, site_id on public.assets
  for each row execute function private.guard_asset();

create or replace function private.guard_site_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id and (
    exists (select 1 from public.assets a where a.site_id = old.id)
    or exists (select 1 from public.project_sites ps where ps.site_id = old.id)) then
    raise exception 'un sitio con activos o proyectos no puede cambiar de organización' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger sites_guard_org before update of organization_id on public.sites
  for each row execute function private.guard_site_org();

create or replace function private.guard_turbine_specs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.assets a where a.id = new.asset_id and a.kind = 'wind_turbine') then
    raise exception 'las especificaciones de turbina requieren un activo wind_turbine' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger wind_turbine_specs_guard before insert or update of asset_id on public.wind_turbine_specs
  for each row execute function private.guard_turbine_specs();

create or replace function private.guard_project_site() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.sites s join public.projects pj on pj.organization_id = s.organization_id
    where s.id = new.site_id and pj.id = new.project_id) then
    raise exception 'el sitio debe pertenecer a la organización del proyecto' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_sites_guard before insert or update on public.project_sites
  for each row execute function private.guard_project_site();

create or replace function private.guard_project_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id and (
    exists (select 1 from public.inspections i where i.project_id = old.id)
    or exists (select 1 from public.project_sites ps where ps.project_id = old.id)) then
    raise exception 'un proyecto con inspecciones o sitios no puede cambiar de organización' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger projects_guard_org before update of organization_id on public.projects
  for each row execute function private.guard_project_org();

create or replace function private.guard_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.platform_role in ('technician', 'service')) then
    raise exception 'solo se asigna personal técnico o de servicio' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger project_assignments_guard before insert or update of user_id on public.project_assignments
  for each row execute function private.guard_assignment();

-- Al perder el rol técnico/servicio se borran sus asignaciones
create or replace function private.drop_assignments_on_demotion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.platform_role is null or new.platform_role not in ('technician', 'service') then
    delete from public.project_assignments where user_id = new.id;
  end if;
  return new;
end $$;
create trigger profiles_drop_assignments after update of platform_role on public.profiles
  for each row when (new.platform_role is distinct from old.platform_role)
  execute function private.drop_assignments_on_demotion();

create or replace function private.guard_inspection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.assets a join public.projects pj on pj.organization_id = a.organization_id
    where a.id = new.asset_id and pj.id = new.project_id) then
    raise exception 'el activo debe pertenecer a la organización del proyecto' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'una inspección no cambia de proyecto' using errcode = 'P0001';
  end if;
  -- Entrar o salir de approved es solo del admin (procesos sin sesión, p. ej. SQL directo, quedan fuera)
  if (tg_op = 'INSERT' and new.status = 'approved')
     or (tg_op = 'UPDATE' and (new.status = 'approved') is distinct from (old.status = 'approved')) then
    if (select auth.uid()) is not null and not private.is_admin() then
      raise exception 'solo un admin aprueba o desaprueba una inspección' using errcode = 'P0001';
    end if;
    if new.status = 'approved' then
      new.approved_at := now();
      new.approved_by := (select auth.uid());
    else
      new.approved_at := null;
      new.approved_by := null;
    end if;
  elsif tg_op = 'INSERT' then
    new.approved_at := null;
    new.approved_by := null;
  else
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end $$;
create trigger inspections_guard before insert or update on public.inspections
  for each row execute function private.guard_inspection();

-- RLS
alter table public.sites enable row level security;
alter table public.assets enable row level security;
alter table public.wind_turbine_specs enable row level security;
alter table public.projects enable row level security;
alter table public.project_sites enable row level security;
alter table public.project_assignments enable row level security;
alter table public.inspections enable row level security;

create policy sites_select on public.sites for select to authenticated using (private.can_read_org(organization_id));
create policy sites_insert on public.sites for insert to authenticated with check (private.is_admin());
create policy sites_update on public.sites for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy sites_delete on public.sites for delete to authenticated using (private.is_admin());

create policy assets_select on public.assets for select to authenticated using (private.can_read_org(organization_id));
create policy assets_insert on public.assets for insert to authenticated with check (private.is_admin());
create policy assets_update on public.assets for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy assets_delete on public.assets for delete to authenticated using (private.is_admin());

create policy specs_select on public.wind_turbine_specs for select to authenticated
  using (exists (select 1 from public.assets a where a.id = asset_id and private.can_read_org(a.organization_id)));
create policy specs_insert on public.wind_turbine_specs for insert to authenticated with check (private.is_admin());
create policy specs_update on public.wind_turbine_specs for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy specs_delete on public.wind_turbine_specs for delete to authenticated using (private.is_admin());

create policy projects_select on public.projects for select to authenticated using (private.can_read_project(id));
create policy projects_insert on public.projects for insert to authenticated with check (private.is_admin());
create policy projects_update on public.projects for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy projects_delete on public.projects for delete to authenticated using (private.is_admin());

create policy project_sites_select on public.project_sites for select to authenticated using (private.can_read_project(project_id));
create policy project_sites_insert on public.project_sites for insert to authenticated with check (private.is_admin());
create policy project_sites_update on public.project_sites for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy project_sites_delete on public.project_sites for delete to authenticated using (private.is_admin());

create policy assignments_select on public.project_assignments for select to authenticated
  using (private.is_admin() or (user_id = (select auth.uid()) and exists (
    select 1 from public.profiles pr where pr.id = user_id and pr.is_active
      and pr.platform_role in ('technician', 'service'))));
create policy assignments_insert on public.project_assignments for insert to authenticated with check (private.is_admin());
create policy assignments_update on public.project_assignments for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy assignments_delete on public.project_assignments for delete to authenticated using (private.is_admin());

create policy inspections_select on public.inspections for select to authenticated using (private.can_read_project(project_id));
create policy inspections_insert on public.inspections for insert to authenticated
  with check (private.can_write_project(project_id));
create policy inspections_update on public.inspections for update to authenticated
  using (private.can_edit_inspection_data(project_id, id))
  with check (private.can_write_project(project_id));
create policy inspections_delete on public.inspections for delete to authenticated using (private.is_admin());
