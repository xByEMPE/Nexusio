-- Reversa de 20261117000100_inspections_delete.sql. NO se aplica sola (está fuera de supabase/migrations).
-- Ejecutar a mano, como postgres, en una sola transacción, y después marcar la migración como revertida:
--   supabase migration repair --status reverted 20261117000100
-- Restaura las versiones vigentes antes de la migración (20261111000200/300/400/600, 20261115000100 y
-- 20261116000100) y devuelve ingest_manifest a su forma original.
-- ATENCIÓN: borra la tabla deletion_log (el registro de borrados) y la columna deleting_at. Los datos ya
-- eliminados no se recuperan. Si hay borrados pendientes (deleting_at no nulo) la reversa se detiene: termínalos
-- o reintenta antes (si no, esas inspecciones volverían a verse para clientes y técnicos).
-- Respaldar deletion_log si se quiere conservar:  \copy (select * from public.deletion_log) to 'deletion_log.csv' csv header

begin;

do $$
begin
  if exists (select 1 from public.inspections where deleting_at is not null) then
    raise exception 'hay inspecciones con eliminación pendiente: termina o reintenta el borrado antes de revertir';
  end if;
end $$;

-- 1) ingest_manifest vuelve a ser la función original
drop function public.ingest_manifest(jsonb);
alter function private.ingest_manifest_core(jsonb) set schema public;
alter function public.ingest_manifest_core(jsonb) rename to ingest_manifest;

-- 2) Políticas y funciones de permiso, con su definición anterior
create or replace function private.can_edit_inspection_data(p uuid, i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_write_project(p) and (not private.inspection_is_locked(i) or private.is_admin());
$$;

create or replace function private.storage_can_read(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.storage_path_ids(name) s
    join public.inspections i on i.id = s.inspection_id and i.project_id = s.project_id
    where private.org_of_project(s.project_id) = s.org_id
      and private.can_read_project(s.project_id));
$$;

create or replace function private.can_see_finding(p uuid, i uuid, s public.finding_status) returns boolean
language sql stable security definer set search_path = '' as $$
  select ((private.is_staff() or private.is_assigned(p)) and private.can_read_project(p))
    or (s = 'confirmed'
        and private.is_org_member(private.org_of_project(p))
        and exists (select 1 from public.inspections n
          where n.id = i and n.project_id = p and n.status = 'approved'));
$$;

drop policy inspections_select on public.inspections;
create policy inspections_select on public.inspections for select to authenticated using (private.can_read_project(project_id));

drop policy captures_select on public.captures;
create policy captures_select on public.captures for select to authenticated
  using (private.can_read_project(project_id));
drop policy blade_captures_select on public.blade_captures;
create policy blade_captures_select on public.blade_captures for select to authenticated
  using (private.can_read_project(project_id));
drop policy thermal_captures_select on public.thermal_captures;
create policy thermal_captures_select on public.thermal_captures for select to authenticated
  using (private.can_read_project(project_id));
drop policy mosaics_select on public.mosaics;
create policy mosaics_select on public.mosaics for select to authenticated
  using (private.can_read_project(project_id));

drop policy comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (private.can_read_project(project_id)
    and (finding_id is null or exists (select 1 from public.findings f where f.id = finding_id)));
drop policy comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (private.can_comment_project(project_id) and author_id = (select auth.uid())
    and (finding_id is null or exists (select 1 from public.findings f where f.id = finding_id)));
drop policy comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and private.can_read_project(project_id)
    and (finding_id is null or exists (select 1 from public.findings f where f.id = comments.finding_id)))
  with check (author_id = (select auth.uid())
    and (finding_id is null or exists (select 1 from public.findings f where f.id = comments.finding_id)));

-- 3) Lo que agregó la migración
drop trigger inspections_guard_deleting on public.inspections;
drop function private.guard_inspection_deleting();

drop function public.deletion_preview(text, uuid, uuid);
drop function public.deletion_objects(uuid, integer);
drop function public.begin_inspection_delete(uuid, text);
drop function public.begin_scope_delete(text, uuid, uuid, text);
drop function public.finish_inspection_delete(uuid);
drop function public.delete_project_row(uuid, text);
drop function private.begin_one(uuid, text, text);
drop function private.deletion_scope(text, uuid, uuid);
drop function private.inspection_counts(uuid);

drop table public.deletion_log;
drop function private.deletion_log_immutable();

drop function private.inspection_hidden(uuid);
drop function private.inspection_is_deleting(uuid);
alter table public.inspections drop column deleting_at;

commit;
