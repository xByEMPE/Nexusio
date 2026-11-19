-- Reversa de 20261118000200_ai_runs.sql. NO se aplica sola (está fuera de supabase/migrations).
-- Ejecutar a mano, como postgres, en una sola transacción, y después marcar la migración como revertida:
--   supabase migration repair --status reverted 20261118000200
-- ATENCIÓN: borra public.ai_runs (se pierde qué fotos ya procesó la IA: el worker volvería a procesarlas todas
-- si se vuelve a aplicar). Los daños ya insertados por la IA NO se tocan. Respaldar antes si se quiere conservar:
--   \copy public.ai_runs to 'ai_runs.csv' csv header
-- El tipo de daño 'ai_unclassified' solo se borra si ningún daño lo usa; si lo usan, se desactiva.

begin;

drop function public.ai_start_run(uuid, text, text);
drop function public.ai_record_run(jsonb, uuid, text, text, text);
drop function public.ai_pending_captures(int);
drop table public.ai_runs;
drop function private.guard_ai_runs();
drop function private.is_ai_worker();

delete from public.finding_types t
where t.domain = 'wind_blade' and t.code = 'ai_unclassified'
  and not exists (select 1 from public.findings f where f.type_id = t.id);
update public.finding_types set is_active = false where domain = 'wind_blade' and code = 'ai_unclassified';

commit;
