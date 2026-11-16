-- Fase 3 (revisión final): editar un comentario de un daño exige, igual que leerlo, que el daño sea visible.
-- No modifica migraciones anteriores: reemplaza la política comments_update.
-- La subconsulta se evalúa con el RLS de findings (un cliente solo ve confirmados de inspecciones aprobadas).

drop policy comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and private.can_read_project(project_id)
    and (finding_id is null or exists (select 1 from public.findings f where f.id = comments.finding_id)))
  with check (author_id = (select auth.uid())
    and (finding_id is null or exists (select 1 from public.findings f where f.id = comments.finding_id)));
