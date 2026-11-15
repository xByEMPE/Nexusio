-- Fase 3: qué ve el cliente de los daños y columnas de sistema protegidas (§4.5, §5 del diseño de la fase 3).
-- No modifica las migraciones de la fase 1: reemplaza políticas y funciones.

-- 5.1 Visibilidad de daños
-- Personal (admin, técnico o cuenta service asignados): todos los daños de sus proyectos.
-- La cuenta service cuenta como personal aquí porque ingest_manifest (security invoker) inserta con
-- returning / on conflict, que exigen que la fila sea visible para quien ingiere.
-- Cliente (miembro activo de la organización): solo daños confirmados de inspecciones aprobadas.
create or replace function private.can_see_finding(p uuid, i uuid, s public.finding_status) returns boolean
language sql stable security definer set search_path = '' as $$
  select ((private.is_staff() or private.is_assigned(p)) and private.can_read_project(p))
    or (s = 'confirmed'
        and private.is_org_member(private.org_of_project(p))
        and exists (select 1 from public.inspections n
          where n.id = i and n.project_id = p and n.status = 'approved'));
$$;
revoke execute on function private.can_see_finding(uuid, uuid, public.finding_status) from public, anon;
grant execute on function private.can_see_finding(uuid, uuid, public.finding_status) to authenticated;

drop policy findings_select on public.findings;
create policy findings_select on public.findings for select to authenticated
  using (private.can_see_finding(project_id, inspection_id, status));

-- Comentarios de un daño: solo si el daño es visible (la subconsulta se evalúa con el RLS de findings).
drop policy comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (private.can_read_project(project_id)
    and (finding_id is null or exists (select 1 from public.findings f where f.id = finding_id)));

drop policy comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (private.can_comment_project(project_id) and author_id = (select auth.uid())
    and (finding_id is null or exists (select 1 from public.findings f where f.id = finding_id)));

-- Revisión del cliente: además exige que el daño sea visible. Marca la transacción con nexus.review
-- para que el guardia de columnas de sistema deje escribir client_reviewed_*.
create or replace function public.mark_finding_reviewed(p_finding_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
  v_inspection uuid;
  v_status public.finding_status;
  v_prev text := current_setting('nexus.review', true);
begin
  select project_id, inspection_id, status into v_project, v_inspection, v_status
  from public.findings where id = p_finding_id;
  if v_project is null
     or not private.is_org_member(private.org_of_project(v_project), array['client_manager']::public.org_member_role[])
     or not private.can_see_finding(v_project, v_inspection, v_status) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform set_config('nexus.review', 'on', true);
  update public.findings
    set client_reviewed_at = now(), client_reviewed_by = (select auth.uid())
    where id = p_finding_id;
  perform set_config('nexus.review', coalesce(v_prev, ''), true);
end $$;
revoke execute on function public.mark_finding_reviewed(uuid) from public, anon;
grant execute on function public.mark_finding_reviewed(uuid) to authenticated;

-- 5.2 Columnas de sistema protegidas
-- Solo para sesiones con usuario y fuera de la ingesta. El nombre del trigger lo hace correr después de
-- findings_guard y antes de findings_guard_update (orden alfabético), así que en update compara lo que
-- escribió el usuario contra OLD antes de que findings_guard_update ponga corrected_*.
-- ai_original en update lo sigue rechazando findings_guard_update ('ai_original_immutable', P0001), siempre.
create or replace function private.guard_finding_system_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or current_setting('nexus.ingest', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.corrected_at is not null or new.corrected_by is not null
       or new.client_reviewed_at is not null or new.client_reviewed_by is not null
       or new.source is distinct from 'manual'
       or new.ai_confidence is not null or new.ai_model is not null
       or new.ai_model_version is not null or new.ai_original is not null then
      raise exception 'system_column' using errcode = 'P0001';
    end if;
    new.created_by := (select auth.uid());
  else
    if new.corrected_at is distinct from old.corrected_at or new.corrected_by is distinct from old.corrected_by
       or new.created_by is distinct from old.created_by or new.source is distinct from old.source
       or new.ai_confidence is distinct from old.ai_confidence or new.ai_model is distinct from old.ai_model
       or new.ai_model_version is distinct from old.ai_model_version then
      raise exception 'system_column' using errcode = 'P0001';
    end if;
    if current_setting('nexus.review', true) is distinct from 'on' and (
       new.client_reviewed_at is distinct from old.client_reviewed_at
       or new.client_reviewed_by is distinct from old.client_reviewed_by) then
      raise exception 'system_column' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.guard_finding_system_columns() from public, anon, authenticated;

create trigger findings_guard_system_columns before insert or update on public.findings
  for each row execute function private.guard_finding_system_columns();
