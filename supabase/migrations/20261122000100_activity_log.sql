-- Registro de actividad (auditoría ampliada) y eliminación completa de usuarios. Aditiva y reversible
-- (supabase/rollbacks/20261122000100_activity_log.down.sql).
--
-- 1) change_log.project_id pasa a admitir null (eventos globales: usuarios, organizaciones, sitios, activos,
--    catálogo). Políticas: el admin lee todo; el personal solo lo de proyectos que puede leer (y nunca las
--    asignaciones, que son gestión de usuarios); el cliente nada. La tabla sigue siendo inmutable y de solo trigger.
-- 2) private.audit_change se amplía: resuelve project_id y row_id en tablas sin columna `id`/`project_id`, trunca el
--    cuerpo de los comentarios a 200 caracteres y se silencia dentro de la purga de un usuario (nexus.purge = 'on').
-- 3) Triggers nuevos, SIEMPRE con lista blanca de columnas (nunca correo, teléfono, contactos ni notas largas).
--    Decisión sobre cascadas: no se audita ninguna tabla de alta cardinalidad nueva (ai_runs, thermal_captures,
--    mosaics, deletion_log quedan fuera; captures/blade_captures/findings/inspections ya se auditaban). El borrado
--    de un proyecto exige antes borrar sus inspecciones, así que solo cascadan sus sitios ligados y asignaciones
--    (pocas filas) y cada una deja su fila `delete`. La purga de un usuario NO genera una fila por cada fila
--    afectada: deja un único evento resumen.
-- 4) private.purge_user / public.admin_delete_user: purga atómica de los datos de un usuario (el usuario de Auth lo
--    borra después el servidor, con la llave de servicio).
--
-- FK hacia public.profiles / auth.users y cómo queda resuelta cada una al purgar:
--   comments.author_id (RESTRICT)            -> se borran sus comentarios en la purga
--   organization_members.user_id (CASCADE)   -> se borran en la purga
--   project_assignments.user_id (CASCADE)    -> se borran en la purga
--   project_assignments.assigned_by, projects.created_by, inspections.approved_by, mosaics.calibrated_by,
--   findings.created_by / corrected_by / client_reviewed_by (SET NULL) -> se ponen en null en la purga (así la
--   eliminación del usuario de Auth ya no toca ninguna tabla de negocio)
--   profiles.id -> auth.users (CASCADE)      -> el perfil lo borra Auth al borrar el usuario; la purga lo deja
--                                               sin rol, inactivo y sin vínculos (cuenta sin acceso, reintentable)
-- Los daños, fotos e inspecciones que creó NO se borran: quedan con el autor en null.
-- change_log y deletion_log no tienen FK a usuarios: conservan su actor_id (anonimizado: sin nombre ni correo).

-- ---------------------------------------------------------------------------------------------------------------
-- 1) change_log: eventos globales, índices y políticas
-- ---------------------------------------------------------------------------------------------------------------
alter table public.change_log alter column project_id drop not null;

create index if not exists change_log_at_idx on public.change_log (at desc);
create index if not exists change_log_actor_at_idx on public.change_log (actor_id, at desc);
create index if not exists change_log_table_at_idx on public.change_log (table_name, at desc);

drop policy change_log_select on public.change_log;
create policy change_log_select on public.change_log for select to authenticated
  using (
    (select private.is_admin())
    or (project_id is not null
        and table_name <> 'project_assignments'
        and private.is_staff()
        and private.can_read_project(project_id))
  );

-- ---------------------------------------------------------------------------------------------------------------
-- 2) audit_change ampliada. TG_ARGV = columnas vigiladas (vacío = todas menos updated_at).
-- ---------------------------------------------------------------------------------------------------------------
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
  -- Dentro de la purga de un usuario no se audita fila por fila (la purga deja un evento resumen).
  if current_setting('nexus.purge', true) = 'on' then
    return null;
  end if;

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

  -- Los comentarios no guardan su cuerpo completo
  if TG_TABLE_NAME = 'comments' then
    if v_old ? 'body' then v_old := jsonb_set(v_old, '{body}', to_jsonb(left(v_old ->> 'body', 200))); end if;
    if v_new ? 'body' then v_new := jsonb_set(v_new, '{body}', to_jsonb(left(v_new ->> 'body', 200))); end if;
  end if;

  -- Fila: id; si no hay, la clave natural (blade_captures: capture_id; wind_turbine_specs: asset_id;
  -- organization_members y project_assignments: user_id; project_sites: site_id).
  v_row := coalesce(v_src ->> 'id', v_src ->> 'capture_id', v_src ->> 'asset_id', v_src ->> 'user_id', v_src ->> 'site_id')::uuid;
  -- Proyecto: su columna project_id o, en `projects`, el propio id. Sin ninguno = evento global (null).
  v_project := coalesce(nullif(v_src ->> 'project_id', ''), case when TG_TABLE_NAME = 'projects' then v_src ->> 'id' end)::uuid;

  insert into public.change_log (project_id, table_name, row_id, action, actor_id, old, new)
  values (v_project, TG_TABLE_NAME, v_row, lower(TG_OP), (select auth.uid()), v_old, v_new);
  return null;
end $$;
revoke execute on function private.audit_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Triggers de auditoría nuevos (listas blancas)
-- ---------------------------------------------------------------------------------------------------------------
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function private.audit_change('organization_id', 'name', 'code', 'status', 'start_date', 'end_date');
create trigger project_sites_audit after insert or update or delete on public.project_sites
  for each row execute function private.audit_change('project_id', 'site_id');
create trigger project_assignments_audit after insert or update or delete on public.project_assignments
  for each row execute function private.audit_change('project_id', 'user_id');
create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function private.audit_change('name', 'slug');
create trigger organization_members_audit after insert or update or delete on public.organization_members
  for each row execute function private.audit_change('organization_id', 'user_id', 'role');
create trigger sites_audit after insert or update or delete on public.sites
  for each row execute function private.audit_change('organization_id', 'kind', 'name', 'lat', 'lon');
create trigger assets_audit after insert or update or delete on public.assets
  for each row execute function private.audit_change('organization_id', 'site_id', 'kind', 'name', 'code', 'lat', 'lon');
create trigger wind_turbine_specs_audit after insert or update or delete on public.wind_turbine_specs
  for each row execute function private.audit_change('manufacturer', 'model', 'blade_length_m', 'rotor_diameter_m', 'hub_height_m');
create trigger comments_audit after insert or update or delete on public.comments
  for each row execute function private.audit_change('inspection_id', 'finding_id', 'author_id', 'body');
-- Perfiles: solo rol y estado (ni nombre ni correo: el historial debe poder anonimizarse). El borrado lo registra
-- la purga con un evento propio.
create trigger profiles_audit after insert or update on public.profiles
  for each row execute function private.audit_change('platform_role', 'is_active');
create trigger finding_types_audit after insert or update or delete on public.finding_types
  for each row execute function private.audit_change('domain', 'code', 'label_es', 'label_en', 'is_active');

-- ---------------------------------------------------------------------------------------------------------------
-- 4) Purga de un usuario
-- ---------------------------------------------------------------------------------------------------------------
-- guard_inspection devolvía siempre approved_by a su valor anterior, lo que habría hecho fallar la FK al quitar al
-- usuario que aprobó una inspección. Solo se permite ponerlo en null durante la purga (nexus.purge = 'on').
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
    new.approved_by := case
      when current_setting('nexus.purge', true) = 'on' and new.approved_by is null then null
      else old.approved_by end;
  end if;
  return new;
end $$;

create or replace function private.purge_user(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile record;
  v_others integer;
  v_orgs uuid[];
  v_comments bigint;
  v_members bigint;
  v_assign bigint;
  v_prev_ingest text := current_setting('nexus.ingest', true);
begin
  select p.id, p.platform_role, p.is_active into v_profile
  from public.profiles p where p.id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'profile_missing');
  end if;

  -- Nunca se elimina al último administrador activo (se bloquean los demás para serializar dos eliminaciones)
  if v_profile.platform_role = 'admin' and v_profile.is_active then
    select count(*) into v_others from (
      select 1 from public.profiles a
      where a.platform_role = 'admin' and a.is_active and a.id <> p_user_id for update) s;
    if v_others = 0 then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;

  -- nexus.purge silencia la auditoría fila por fila; nexus.ingest salta las guardas de columnas de sistema
  perform set_config('nexus.purge', 'on', true);
  perform set_config('nexus.ingest', 'on', true);

  select coalesce(array_agg(m.organization_id), '{}') into v_orgs
  from public.organization_members m where m.user_id = p_user_id;

  with d as (delete from public.comments where author_id = p_user_id returning 1)
  select count(*) into v_comments from d;
  with d as (delete from public.organization_members where user_id = p_user_id returning 1)
  select count(*) into v_members from d;
  with d as (delete from public.project_assignments where user_id = p_user_id returning 1)
  select count(*) into v_assign from d;

  update public.project_assignments set assigned_by = null where assigned_by = p_user_id;
  update public.projects set created_by = null where created_by = p_user_id;
  update public.inspections set approved_by = null where approved_by = p_user_id;
  update public.mosaics set calibrated_by = null where calibrated_by = p_user_id;
  update public.findings
  set created_by = case when created_by = p_user_id then null else created_by end,
      corrected_by = case when corrected_by = p_user_id then null else corrected_by end,
      client_reviewed_by = case when client_reviewed_by = p_user_id then null else client_reviewed_by end
  where p_user_id in (created_by, corrected_by, client_reviewed_by);

  -- Sin rol, sin acceso y sin vínculos: si Auth falla al borrar el usuario, la cuenta queda visible como «sin acceso»
  update public.profiles set platform_role = null, is_active = false where id = p_user_id;

  -- Evento de auditoría: solo id, rol y organizaciones (sin correo ni nombre). Uno por usuario (reintentos no duplican).
  if not exists (
    select 1 from public.change_log l where l.table_name = 'profiles' and l.action = 'delete' and l.row_id = p_user_id) then
    insert into public.change_log (project_id, table_name, row_id, action, actor_id, old, new)
    values (null, 'profiles', p_user_id, 'delete', (select auth.uid()),
      jsonb_build_object('platform_role', v_profile.platform_role, 'is_active', v_profile.is_active,
        'organization_ids', to_jsonb(v_orgs), 'comments_deleted', v_comments,
        'memberships_deleted', v_members, 'assignments_deleted', v_assign),
      null);
  end if;

  perform set_config('nexus.purge', '', true);
  perform set_config('nexus.ingest', coalesce(v_prev_ingest, ''), true);
  return jsonb_build_object('status', 'purged', 'comments', v_comments, 'memberships', v_members, 'assignments', v_assign);
end $$;
revoke execute on function private.purge_user(uuid) from public, anon, authenticated;

create or replace function public.admin_delete_user(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot_delete_self' using errcode = 'P0001';
  end if;
  return private.purge_user(p_user_id);
end $$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
