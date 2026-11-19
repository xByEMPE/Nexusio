-- Borrado de inspecciones y proyectos (solo admin), con rastro propio e inmutable.
-- No modifica migraciones anteriores: agrega columna, tabla y funciones, y reemplaza políticas y funciones.
--
-- Flujo seguro ante fallos a medias (lo orquesta el servidor del portal):
--   1) begin_*: marca `inspections.deleting_at` (la inspección deja de verse para cliente/técnico y
--      deja de aceptar escrituras: ingesta y Storage) y registra el inicio en deletion_log.
--   2) El servidor borra los archivos con la API de Storage (nunca con SQL sobre storage.objects, que
--      dejaría blobs huérfanos), usando deletion_objects para listar lo que queda.
--   3) finish_inspection_delete: verifica que ya no quedan objetos, borra las filas en el orden que
--      exigen las FK RESTRICT y cierra el registro. delete_project_row: borra el proyecto vacío.
-- change_log (inmutable) no se toca: conserva su historia y recibe las filas `delete` de los triggers.

alter table public.inspections add column deleting_at timestamptz;

-- Funciones de apoyo para las políticas
create or replace function private.inspection_is_deleting(i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.inspections n where n.id = i and n.deleting_at is not null);
$$;

-- Oculta la inspección para quien no es admin (el admin la sigue viendo para reintentar el borrado)
create or replace function private.inspection_hidden(i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.inspection_is_deleting(i) and not private.is_admin();
$$;

revoke execute on function private.inspection_is_deleting(uuid), private.inspection_hidden(uuid) from public, anon;
grant execute on function private.inspection_is_deleting(uuid), private.inspection_hidden(uuid) to authenticated;

-- deleting_at solo lo escribe el borrado (nexus.deleting); sesiones sin usuario (SQL directo) quedan fuera.
create or replace function private.guard_inspection_deleting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and current_setting('nexus.deleting', true) is distinct from 'on'
     and ((tg_op = 'INSERT' and new.deleting_at is not null)
          or (tg_op = 'UPDATE' and new.deleting_at is distinct from old.deleting_at)) then
    raise exception 'system_column' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function private.guard_inspection_deleting() from public, anon, authenticated;
create trigger inspections_guard_deleting before insert or update on public.inspections
  for each row execute function private.guard_inspection_deleting();

-- Registro de borrados: solo se agrega, nunca se altera. Cada operación deja un evento `started` al
-- marcar la inspección y uno `completed` al terminar (mismo operation_id). Las operaciones sobre un
-- activo o un proyecto dejan un par por inspección (entity_type = 'inspection') y, en el proyecto, un
-- evento final con entity_type = 'project'.
create table public.deletion_log (
  id bigint generated always as identity primary key,
  operation_id uuid not null,
  status text not null check (status in ('started', 'completed')),
  kind text not null check (kind in ('inspection', 'asset_inspections', 'project')),
  entity_type text not null check (entity_type in ('inspection', 'project')),
  entity_id uuid not null,
  organization_id uuid,
  project_id uuid,
  name text,
  counts jsonb not null default '{}'::jsonb,
  bytes bigint not null default 0,
  actor_id uuid,
  reason text check (reason is null or length(reason) <= 500),
  at timestamptz not null default now()
);
create index deletion_log_entity_idx on public.deletion_log (entity_id, id desc);
create index deletion_log_project_idx on public.deletion_log (project_id, at desc);

alter table public.deletion_log enable row level security;
create policy deletion_log_select on public.deletion_log for select to authenticated
  using (private.is_admin());
revoke all on public.deletion_log from public, anon, authenticated, service_role;
grant select on public.deletion_log to authenticated;

create or replace function private.deletion_log_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'deletion_log_immutable' using errcode = 'P0001';
end $$;
revoke execute on function private.deletion_log_immutable() from public, anon, authenticated;
create trigger deletion_log_immutable before update or delete on public.deletion_log
  for each row execute function private.deletion_log_immutable();
create trigger deletion_log_no_truncate before truncate on public.deletion_log
  for each statement execute function private.deletion_log_immutable();

-- Guardas de lectura y escritura sobre una inspección en eliminación
drop policy inspections_select on public.inspections;
create policy inspections_select on public.inspections for select to authenticated
  using (private.can_read_project(project_id) and (deleting_at is null or private.is_admin()));

drop policy captures_select on public.captures;
create policy captures_select on public.captures for select to authenticated
  using (private.can_read_project(project_id) and not private.inspection_hidden(inspection_id));
drop policy blade_captures_select on public.blade_captures;
create policy blade_captures_select on public.blade_captures for select to authenticated
  using (private.can_read_project(project_id) and not private.inspection_hidden(private.inspection_of_capture(capture_id)));
drop policy thermal_captures_select on public.thermal_captures;
create policy thermal_captures_select on public.thermal_captures for select to authenticated
  using (private.can_read_project(project_id) and not private.inspection_hidden(private.inspection_of_capture(capture_id)));
drop policy mosaics_select on public.mosaics;
create policy mosaics_select on public.mosaics for select to authenticated
  using (private.can_read_project(project_id) and not private.inspection_hidden(inspection_id));

-- Daños: misma regla de la fase 3 más la guarda
create or replace function private.can_see_finding(p uuid, i uuid, s public.finding_status) returns boolean
language sql stable security definer set search_path = '' as $$
  select not private.inspection_hidden(i) and (
    ((private.is_staff() or private.is_assigned(p)) and private.can_read_project(p))
    or (s = 'confirmed'
        and private.is_org_member(private.org_of_project(p))
        and exists (select 1 from public.inspections n
          where n.id = i and n.project_id = p and n.status = 'approved')));
$$;

drop policy comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (private.can_read_project(project_id) and not private.inspection_hidden(inspection_id)
    and (finding_id is null or exists (select 1 from public.findings f where f.id = finding_id)));
drop policy comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (private.can_comment_project(project_id) and author_id = (select auth.uid())
    and not private.inspection_is_deleting(inspection_id)
    and (finding_id is null or exists (select 1 from public.findings f where f.id = finding_id)));
drop policy comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and private.can_read_project(project_id)
    and not private.inspection_is_deleting(inspection_id)
    and (finding_id is null or exists (select 1 from public.findings f where f.id = comments.finding_id)))
  with check (author_id = (select auth.uid())
    and (finding_id is null or exists (select 1 from public.findings f where f.id = comments.finding_id)));

-- Escritura: nadie edita datos de una inspección en eliminación (afecta las políticas de captura, daños,
-- tiras, inspecciones y storage_can_write). Las funciones de borrado son security definer.
create or replace function private.can_edit_inspection_data(p uuid, i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_write_project(p) and (not private.inspection_is_locked(i) or private.is_admin())
    and not private.inspection_is_deleting(i);
$$;

create or replace function private.storage_can_read(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.storage_path_ids(name) s
    join public.inspections i on i.id = s.inspection_id and i.project_id = s.project_id
    where private.org_of_project(s.project_id) = s.org_id
      and private.can_read_project(s.project_id)
      and (i.deleting_at is null or private.is_admin()));
$$;

-- ingest_manifest: la original pasa a private.ingest_manifest_core (mismo código, mismos permisos de
-- quien llama: security invoker) y la nueva rechaza con un código claro las inspecciones en eliminación.
alter function public.ingest_manifest(jsonb) set schema private;
alter function private.ingest_manifest(jsonb) rename to ingest_manifest_core;
revoke execute on function private.ingest_manifest_core(jsonb) from public, anon;
grant execute on function private.ingest_manifest_core(jsonb) to authenticated;

create or replace function public.ingest_manifest(p_manifest jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_project text;
  v_insp text;
begin
  if jsonb_typeof(p_manifest) = 'object' then
    v_project := p_manifest ->> 'project_id';
    v_insp := p_manifest #>> '{inspection,id}';
    if v_project ~* v_uuid and v_insp ~* v_uuid
       and private.can_write_project(v_project::uuid)
       and private.inspection_is_deleting(v_insp::uuid) then
      raise exception using errcode = '22023', message = 'manifest_invalid',
        detail = jsonb_build_array(jsonb_build_object('path', '/inspection/id', 'code', 'inspection_deleting'))::text;
    end if;
  end if;
  return private.ingest_manifest_core(p_manifest);
end $$;
revoke execute on function public.ingest_manifest(jsonb) from public, anon;
grant execute on function public.ingest_manifest(jsonb) to authenticated;

-- Alcance de una operación de borrado (no se expone)
create or replace function private.deletion_scope(p_kind text, p_id uuid, p_project uuid)
returns table(inspection_id uuid)
language sql stable security definer set search_path = '' as $$
  select i.id from public.inspections i
  where case p_kind
    when 'inspection' then i.id = p_id
    when 'asset_inspections' then i.asset_id = p_id and (p_project is null or i.project_id = p_project)
    when 'project' then i.project_id = p_id
    else false end
  order by i.created_at, i.id;
$$;

-- Conteos de una inspección (filas y objetos de Storage)
create or replace function private.inspection_counts(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'captures', (select count(*) from public.captures where inspection_id = p_id),
    'mosaics', (select count(*) from public.mosaics where inspection_id = p_id),
    'findings', (select count(*) from public.findings where inspection_id = p_id),
    'comments', (select count(*) from public.comments where inspection_id = p_id),
    'objects', o.n, 'bytes', o.b)
  from (
    select count(x.id) as n, coalesce(sum((x.metadata ->> 'size')::bigint), 0) as b
    from public.inspections i
    join public.projects pj on pj.id = i.project_id
    cross join lateral (select lower(pj.organization_id || '/' || i.project_id || '/' || i.id || '/') as p) pf
    left join storage.objects x on x.bucket_id = 'inspection-media'
      and lower(x.name) collate "C" >= pf.p and lower(x.name) collate "C" < left(pf.p, -1) || '0'
    where i.id = p_id) o;
$$;

revoke execute on function private.deletion_scope(text, uuid, uuid), private.inspection_counts(uuid)
  from public, anon, authenticated;

-- Resumen previo: qué se borrará (y cuánto)
create or replace function public.deletion_preview(p_kind text, p_id uuid, p_project_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text;
  v_org text;
  v_status text;
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind not in ('inspection', 'asset_inspections', 'project') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  if p_kind = 'inspection' then
    select a.name, o.name into v_name, v_org
    from public.inspections i
    join public.assets a on a.id = i.asset_id
    join public.projects pj on pj.id = i.project_id
    join public.organizations o on o.id = pj.organization_id
    where i.id = p_id;
  elsif p_kind = 'asset_inspections' then
    select a.name, o.name into v_name, v_org
    from public.assets a join public.organizations o on o.id = a.organization_id
    where a.id = p_id and (p_project_id is null or exists (
      select 1 from public.projects pj where pj.id = p_project_id and pj.organization_id = a.organization_id));
  else
    select pj.name, o.name, pj.status::text into v_name, v_org, v_status
    from public.projects pj join public.organizations o on o.id = pj.organization_id
    where pj.id = p_id;
  end if;
  if v_name is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'kind', p_kind,
    'entity_id', p_id,
    'name', v_name,
    'confirm_name', v_name,
    'organization', v_org,
    'project_status', v_status,
    'inspections', coalesce((select count(*) from private.deletion_scope(p_kind, p_id, p_project_id)), 0),
    'approved', coalesce((select count(*) from public.inspections i
      where i.id in (select inspection_id from private.deletion_scope(p_kind, p_id, p_project_id))
        and i.status = 'approved'), 0),
    'pending', coalesce((select count(*) from public.inspections i
      where i.id in (select inspection_id from private.deletion_scope(p_kind, p_id, p_project_id))
        and i.deleting_at is not null), 0),
    'captures', coalesce(sum((c ->> 'captures')::bigint), 0),
    'mosaics', coalesce(sum((c ->> 'mosaics')::bigint), 0),
    'findings', coalesce(sum((c ->> 'findings')::bigint), 0),
    'comments', coalesce(sum((c ->> 'comments')::bigint), 0),
    'objects', coalesce(sum((c ->> 'objects')::bigint), 0),
    'bytes', coalesce(sum((c ->> 'bytes')::bigint), 0),
    'project_sites', case when p_kind = 'project'
      then (select count(*) from public.project_sites where project_id = p_id) else 0 end,
    'assignments', case when p_kind = 'project'
      then (select count(*) from public.project_assignments where project_id = p_id) else 0 end,
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status, 'inspections', t.n)
        order by t.name)
      from (
        select pj.id, pj.name, pj.status, count(*) as n
        from public.inspections i join public.projects pj on pj.id = i.project_id
        where i.id in (select inspection_id from private.deletion_scope(p_kind, p_id, p_project_id))
        group by pj.id, pj.name, pj.status) t), '[]'::jsonb))
  into v_result
  from (select private.inspection_counts(s.inspection_id) as c
        from private.deletion_scope(p_kind, p_id, p_project_id) s) q;
  return v_result;
end $$;

-- Lista (por lotes) los objetos de Storage de una inspección, por prefijo. La comparación es por rango sobre
-- lower(name) collate "C" (usa el índice idx_objects_bucket_id_name_lower de Storage) y no distingue mayúsculas
-- del UUID, igual que storage_path_ids.
create or replace function public.deletion_objects(p_inspection_id uuid, p_limit integer default 1000)
returns setof text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_prefix text;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select lower(pj.organization_id || '/' || i.project_id || '/' || i.id || '/') into v_prefix
  from public.inspections i join public.projects pj on pj.id = i.project_id
  where i.id = p_inspection_id;
  if v_prefix is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return query
    select o.name from storage.objects o
    where o.bucket_id = 'inspection-media'
      and lower(o.name) collate "C" >= v_prefix and lower(o.name) collate "C" < left(v_prefix, -1) || '0'
    order by o.name
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
end $$;

-- Marca una inspección «en eliminación» y registra el inicio (idempotente: devuelve la operación vigente)
create or replace function private.begin_one(p_id uuid, p_reason text, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_op uuid;
  v_counts jsonb;
begin
  select i.deleting_at, i.project_id, pj.organization_id, a.name as asset_name, pj.name as project_name
  into r
  from public.inspections i
  join public.projects pj on pj.id = i.project_id
  join public.assets a on a.id = i.asset_id
  where i.id = p_id
  for update of i;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if r.deleting_at is null then
    v_counts := private.inspection_counts(p_id);
    perform set_config('nexus.deleting', 'on', true);
    update public.inspections set deleting_at = now() where id = p_id;
    perform set_config('nexus.deleting', '', true);
    v_op := gen_random_uuid();
    insert into public.deletion_log (operation_id, status, kind, entity_type, entity_id, organization_id,
      project_id, name, counts, bytes, actor_id, reason)
    values (v_op, 'started', p_kind, 'inspection', p_id, r.organization_id, r.project_id, r.asset_name,
      (v_counts - 'bytes') || jsonb_build_object('project_name', r.project_name),
      (v_counts ->> 'bytes')::bigint, (select auth.uid()), nullif(btrim(p_reason), ''));
  else
    select l.operation_id into v_op from public.deletion_log l
    where l.entity_id = p_id and l.entity_type = 'inspection' and l.status = 'started'
    order by l.id desc limit 1;
  end if;
  return v_op;
end $$;
revoke execute on function private.begin_one(uuid, text, text) from public, anon, authenticated;

create or replace function public.begin_inspection_delete(p_inspection_id uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  return private.begin_one(p_inspection_id, p_reason, 'inspection');
end $$;

-- Marca todas las inspecciones de un alcance (activo o proyecto) y devuelve sus ids, en orden
create or replace function public.begin_scope_delete(p_kind text, p_id uuid, p_project_id uuid default null,
  p_reason text default null)
returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind not in ('asset_inspections', 'project') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  select coalesce(array_agg(s.inspection_id), '{}') into v_ids from private.deletion_scope(p_kind, p_id, p_project_id) s;
  foreach v_id in array v_ids loop
    perform private.begin_one(v_id, p_reason, p_kind);
  end loop;
  return v_ids;
end $$;

-- Borra las filas de una inspección ya vacía de archivos, en el orden que exigen las FK RESTRICT
create or replace function public.finish_inspection_delete(p_inspection_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_left bigint;
  v_started record;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select i.deleting_at, i.project_id, pj.organization_id, a.name as asset_name
  into r
  from public.inspections i
  join public.projects pj on pj.id = i.project_id
  join public.assets a on a.id = i.asset_id
  where i.id = p_inspection_id
  for update of i;
  if not found then
    return jsonb_build_object('status', 'already_deleted');
  end if;
  if r.deleting_at is null then
    raise exception 'not_marked' using errcode = 'P0001';
  end if;

  select count(*) into v_left from storage.objects x
  where x.bucket_id = 'inspection-media'
    and lower(x.name) collate "C" >= lower(r.organization_id || '/' || r.project_id || '/' || p_inspection_id || '/')
    and lower(x.name) collate "C" < left(lower(r.organization_id || '/' || r.project_id || '/' || p_inspection_id || '/'), -1) || '0';
  if v_left > 0 then
    raise exception 'objects_remaining' using errcode = 'P0001', detail = v_left::text;
  end if;

  select l.operation_id, l.kind, l.counts, l.bytes, l.reason into v_started
  from public.deletion_log l
  where l.entity_id = p_inspection_id and l.entity_type = 'inspection' and l.status = 'started'
  order by l.id desc limit 1;

  delete from public.comments where inspection_id = p_inspection_id;
  delete from public.findings where inspection_id = p_inspection_id;
  delete from public.mosaics where inspection_id = p_inspection_id;
  delete from public.captures where inspection_id = p_inspection_id;
  delete from public.inspections where id = p_inspection_id;

  insert into public.deletion_log (operation_id, status, kind, entity_type, entity_id, organization_id,
    project_id, name, counts, bytes, actor_id, reason)
  values (coalesce(v_started.operation_id, gen_random_uuid()), 'completed', coalesce(v_started.kind, 'inspection'),
    'inspection', p_inspection_id, r.organization_id, r.project_id, r.asset_name,
    coalesce(v_started.counts, '{}'::jsonb), coalesce(v_started.bytes, 0), (select auth.uid()), v_started.reason);
  return jsonb_build_object('status', 'deleted', 'operation_id', v_started.operation_id);
end $$;

-- Borra el proyecto (y, en cascada, sus sitios ligados y asignaciones) cuando ya no tiene inspecciones.
-- No toca sitios, activos, organización ni usuarios.
create or replace function public.delete_project_row(p_project_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_sites bigint;
  v_assignments bigint;
  v_done bigint;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  select pj.name, pj.organization_id, pj.status::text as status into r
  from public.projects pj where pj.id = p_project_id for update;
  if not found then
    return jsonb_build_object('status', 'already_deleted');
  end if;
  if exists (select 1 from public.inspections i where i.project_id = p_project_id) then
    raise exception 'inspections_remaining' using errcode = 'P0001';
  end if;

  select count(*) into v_sites from public.project_sites where project_id = p_project_id;
  select count(*) into v_assignments from public.project_assignments where project_id = p_project_id;
  select count(*) into v_done from public.deletion_log
  where project_id = p_project_id and entity_type = 'inspection' and status = 'completed';

  delete from public.projects where id = p_project_id;

  insert into public.deletion_log (operation_id, status, kind, entity_type, entity_id, organization_id,
    project_id, name, counts, bytes, actor_id, reason)
  values (gen_random_uuid(), 'completed', 'project', 'project', p_project_id, r.organization_id, p_project_id,
    r.name,
    jsonb_build_object('project_status', r.status, 'project_sites', v_sites, 'assignments', v_assignments,
      'inspections', v_done),
    0, (select auth.uid()), nullif(btrim(p_reason), ''));
  return jsonb_build_object('status', 'deleted');
end $$;

revoke execute on function
  public.deletion_preview(text, uuid, uuid), public.deletion_objects(uuid, integer),
  public.begin_inspection_delete(uuid, text), public.begin_scope_delete(text, uuid, uuid, text),
  public.finish_inspection_delete(uuid), public.delete_project_row(uuid, text)
  from public, anon;
grant execute on function
  public.deletion_preview(text, uuid, uuid), public.deletion_objects(uuid, integer),
  public.begin_inspection_delete(uuid, text), public.begin_scope_delete(text, uuid, uuid, text),
  public.finish_inspection_delete(uuid), public.delete_project_row(uuid, text)
  to authenticated;
