-- Revierte 20261122000100_activity_log.sql. Los eventos globales (project_id null) se borran para poder volver a
-- exigir project_id not null: es la única vez que se toca change_log, y solo en esta reversión.
drop function if exists public.admin_delete_user(uuid);
drop function if exists private.purge_user(uuid);

drop trigger if exists projects_audit on public.projects;
drop trigger if exists project_sites_audit on public.project_sites;
drop trigger if exists project_assignments_audit on public.project_assignments;
drop trigger if exists organizations_audit on public.organizations;
drop trigger if exists organization_members_audit on public.organization_members;
drop trigger if exists sites_audit on public.sites;
drop trigger if exists assets_audit on public.assets;
drop trigger if exists wind_turbine_specs_audit on public.wind_turbine_specs;
drop trigger if exists comments_audit on public.comments;
drop trigger if exists profiles_audit on public.profiles;
drop trigger if exists finding_types_audit on public.finding_types;

-- guard_inspection original (sin la excepción de purga)
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

-- audit_change original
create or replace function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_src jsonb;
  v_cols text[];
  v_changed text[];
  v_row uuid;
  v_project uuid;
begin
  if TG_OP = 'DELETE' then v_src := to_jsonb(OLD); else v_src := to_jsonb(NEW); end if;

  if TG_NARGS > 0 then
    v_cols := TG_ARGV;
  else
    select array_agg(k) into v_cols from jsonb_object_keys(v_src) k where k <> 'updated_at';
  end if;

  if TG_OP = 'INSERT' then
    v_new := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(NEW)) e where e.key = any (v_cols));
  elsif TG_OP = 'DELETE' then
    v_old := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(OLD)) e where e.key = any (v_cols));
  else
    select array_agg(c) into v_changed from unnest(v_cols) c
      where to_jsonb(OLD) -> c is distinct from to_jsonb(NEW) -> c;
    if v_changed is null then return null; end if;
    v_old := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(OLD)) e where e.key = any (v_changed));
    v_new := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(NEW)) e where e.key = any (v_changed));
  end if;

  v_row := coalesce(v_src ->> 'id', v_src ->> 'capture_id')::uuid;
  v_project := (v_src ->> 'project_id')::uuid;

  insert into public.change_log (project_id, table_name, row_id, action, actor_id, old, new)
  values (v_project, TG_TABLE_NAME, v_row, lower(TG_OP), (select auth.uid()), v_old, v_new);
  return null;
end $$;

drop policy if exists change_log_select on public.change_log;
create policy change_log_select on public.change_log for select to authenticated
  using (private.is_staff() and private.can_read_project(project_id));

drop index if exists public.change_log_at_idx;
drop index if exists public.change_log_actor_at_idx;
drop index if exists public.change_log_table_at_idx;

-- Los eventos globales impiden volver al not null; se borran solo aquí (la tabla es inmutable el resto del tiempo).
alter table public.change_log disable trigger change_log_immutable;
delete from public.change_log where project_id is null;
alter table public.change_log enable trigger change_log_immutable;
alter table public.change_log alter column project_id set not null;
