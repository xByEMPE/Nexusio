-- Reversa de 20261118000100_project_field_defaults.sql. NO se aplica sola (está fuera de supabase/migrations).
-- Ejecutar a mano, como postgres, en una sola transacción, y después marcar la migración como revertida:
--   supabase migration repair --status reverted 20261118000100
-- ATENCIÓN: borra las columnas default_* de projects (se pierden los valores por defecto capturados).
-- ingest_manifest no se modifica en esta migración, así que no hay nada que restaurar de esa función.
-- Los datos de campo ya copiados a las inspecciones (pilot_name, assistant_name, drone_model) NO se tocan.
-- Respaldar antes si se quiere conservar:
--   \copy (select id, default_pilot_name, default_assistant_name, default_drone_model from public.projects) to 'project_defaults.csv' csv header

begin;

drop trigger inspections_field_data_guard on public.inspections;
drop function private.guard_inspection_field_data();

drop trigger inspections_a_defaults on public.inspections;
drop function private.inspection_apply_project_defaults();

alter table public.projects
  drop column default_pilot_name,
  drop column default_assistant_name,
  drop column default_drone_model;

commit;
