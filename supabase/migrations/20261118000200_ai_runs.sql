-- Detección por IA (worker de Hugging Face): marca de procesado atómica por foto.
-- Aditiva: no modifica migraciones anteriores. El worker NO usa service_role: inicia sesión como un usuario con
-- platform_role 'service' asignado a los proyectos, y todo pasa por RLS. Con las políticas vigentes ese rol puede:
--   * leer capturas e inspecciones (can_read_project incluye a la cuenta service asignada),
--   * descargar originales (storage_can_read: misma regla; excluye inspecciones en borrado),
--   * llamar ingest_manifest (can_write_project incluye a service; rechaza inspecciones aprobadas y en borrado).
-- Lo único que faltaba es la marca de procesado, que se añade aquí con el mínimo privilegio:
--   * public.ai_runs: lectura para quien lee el proyecto; el borrado (reprocesar) es solo del admin; el insert/update
--     solo ocurre dentro de ai_record_run (trigger exige nexus.ai_run = 'on') y solo para service o admin.
--   * public.ai_pending_captures / public.ai_record_run: security invoker (RLS aplica igual), solo service o admin.
--
-- Anti «poison pill»: ai_start_run se llama ANTES de descargar y procesar y sube attempts (run 'failed' provisional,
-- last_error 'interrupted'). Si el proceso muere a mitad (memoria, reinicio del Space), la foto ya consumió un intento y
-- tras 3 se rinde, en vez de bajar el original en bucle. ai_record_run solo resuelve ese run (done, o failed con el error).
--
-- Códigos de error de ai_record_run: 42501 not_allowed, P0002 capture_not_found,
-- 22023 manifest_invalid (detail: manifest_mismatch, o los de ingest_manifest).

-- Tipo de daño genérico: el modelo solo da la categoría (1–5 = severidad), no el tipo. Un humano lo reclasifica.
insert into public.finding_types (domain, code, label_es, label_en)
values ('wind_blade', 'ai_unclassified', 'Daño detectado (IA)', 'Detected damage (AI)')
on conflict (domain, code) do nothing;

-- Quién es el worker: cuenta service (o admin, para pruebas y reprocesos manuales) activa.
create or replace function private.is_ai_worker() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.platform_role in ('service', 'admin'));
$$;
revoke execute on function private.is_ai_worker() from public, anon;
grant execute on function private.is_ai_worker() to authenticated;

create table public.ai_runs (
  capture_id uuid primary key references public.captures (id) on delete cascade,
  status text not null check (status in ('done', 'failed')),
  model text not null,
  model_version text not null,
  findings_count integer not null default 0 check (findings_count >= 0),
  attempts integer not null default 1 check (attempts >= 1),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  processed_at timestamptz not null default now()
);

alter table public.ai_runs enable row level security;

-- La visibilidad del run sigue a la de la foto (que ya aplica can_read_project y las inspecciones en borrado).
create policy ai_runs_select on public.ai_runs for select to authenticated
  using (exists (select 1 from public.captures c where c.id = capture_id));
create policy ai_runs_insert on public.ai_runs for insert to authenticated
  with check (private.is_ai_worker() and exists (
    select 1 from public.captures c where c.id = capture_id and private.can_edit_inspection_data(c.project_id, c.inspection_id)));
create policy ai_runs_update on public.ai_runs for update to authenticated
  using (private.is_ai_worker() and exists (
    select 1 from public.captures c where c.id = capture_id and private.can_edit_inspection_data(c.project_id, c.inspection_id)))
  with check (private.is_ai_worker() and exists (
    select 1 from public.captures c where c.id = capture_id and private.can_edit_inspection_data(c.project_id, c.inspection_id)));
-- Reprocesar una foto = borrar su fila (solo admin)
create policy ai_runs_delete on public.ai_runs for delete to authenticated using (private.is_admin());

revoke all on public.ai_runs from public, anon, authenticated;
grant select, insert, update, delete on public.ai_runs to authenticated;

-- Escritura solo vía ai_record_run: sesiones con usuario deben venir marcadas con nexus.ai_run = 'on'.
create or replace function private.guard_ai_runs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and current_setting('nexus.ai_run', true) is distinct from 'on' then
    raise exception 'ai_runs_rpc_only' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function private.guard_ai_runs() from public, anon, authenticated;
create trigger ai_runs_guard before insert or update on public.ai_runs
  for each row execute function private.guard_ai_runs();

-- Fotos RGB pendientes de la IA. security invoker: solo lo que el llamador puede leer.
-- Excluye: térmicas, inspecciones que no son de pala, aprobadas o en borrado, originales aún no subidos,
-- fotos con run 'done' y fotos fallidas 3 veces. Las fallidas esperan 10 min antes de reintentarse y van
-- después de las nuevas (ahorro de egress).
create or replace function public.ai_pending_captures(p_limit int default 10)
returns table (
  capture_id uuid, project_id uuid, inspection_id uuid, asset_id uuid, inspection_kind public.inspection_kind,
  original_path text, file_name text, width_px integer, height_px integer, gsd_mm_px numeric,
  radius_center_m numeric, blade public.blade_position, face public.blade_face, attempts integer)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.is_ai_worker() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select c.id, c.project_id, c.inspection_id, i.asset_id, i.kind, c.original_path, c.file_name, c.width_px,
    c.height_px, c.gsd_mm_px, b.radius_center_m, b.blade, b.face, coalesce(r.attempts, 0)
  from public.captures c
  join public.inspections i on i.id = c.inspection_id
  left join public.blade_captures b on b.capture_id = c.id
  left join public.ai_runs r on r.capture_id = c.id
  where c.spectrum = 'rgb'
    and i.kind = 'wind_blade'
    and i.status <> 'approved'
    and i.deleting_at is null
    and (r.capture_id is null
         or (r.status = 'failed' and r.attempts < 3 and r.processed_at < now() - interval '10 minutes'))
    and exists (select 1 from storage.objects o where o.bucket_id = 'inspection-media' and o.name = c.original_path)
  order by (r.capture_id is not null), c.created_at, c.id
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
end $$;
revoke execute on function public.ai_pending_captures(int) from public, anon;
grant execute on function public.ai_pending_captures(int) to authenticated;

-- Marca el intento ANTES de procesar la foto (ver cabecera). No descarga ni ingesta nada.
create or replace function public.ai_start_run(p_capture_id uuid, p_model text, p_version text) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_prev text := current_setting('nexus.ai_run', true);
  v_status text;
  v_attempts integer;
begin
  if not private.is_ai_worker() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_model is null or btrim(p_model) = '' or p_version is null or btrim(p_version) = '' then
    raise exception 'model_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.captures c where c.id = p_capture_id) then
    raise exception 'capture_not_found' using errcode = 'P0002';
  end if;
  select r.status into v_status from public.ai_runs r where r.capture_id = p_capture_id;
  if v_status = 'done' then
    return jsonb_build_object('status', 'already_done');
  end if;
  perform set_config('nexus.ai_run', 'on', true);
  insert into public.ai_runs as r (capture_id, status, model, model_version, findings_count, attempts, last_error)
  values (p_capture_id, 'failed', p_model, p_version, 0, 1, 'interrupted')
  on conflict (capture_id) do update set status = 'failed', model = excluded.model,
    model_version = excluded.model_version, findings_count = 0, attempts = r.attempts + 1,
    last_error = 'interrupted', processed_at = now()
  where r.status <> 'done'
  returning r.attempts into v_attempts;
  perform set_config('nexus.ai_run', coalesce(v_prev, ''), true);
  return jsonb_build_object('status', 'started', 'attempts', v_attempts);
end $$;
revoke execute on function public.ai_start_run(uuid, text, text) from public, anon;
grant execute on function public.ai_start_run(uuid, text, text) to authenticated;

-- Registra el resultado de una foto en UNA transacción: ingesta los daños (si hay) y marca el run.
--   p_error null  -> éxito: ingest_manifest solo con los daños que no existan ya (nunca se pisa un daño existente,
--                    corregido o no) y run 'done'. Sin daños nuevos no se llama a ingest_manifest (evita empty_manifest).
--   p_error texto -> fallo: run 'failed' con el error (el manifiesto se ignora). attempts lo sube ai_start_run;
--                    sin start previo la fila nace con attempts 1. Un run 'done' nunca se pisa.
-- Si la foto ya tiene run 'done' no hace nada (devuelve already_done). Un error de ingest_manifest revierte todo.
create or replace function public.ai_record_run(p_manifest jsonb, p_capture_id uuid, p_model text, p_version text,
  p_error text default null) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_prev text := current_setting('nexus.ai_run', true);
  v_project uuid;
  v_inspection uuid;
  v_status text;
  v_finds jsonb;
  v_new jsonb;
  v_result jsonb := null;
  v_count integer;
begin
  if not private.is_ai_worker() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_model is null or btrim(p_model) = '' or p_version is null or btrim(p_version) = '' then
    raise exception 'model_required' using errcode = '22023';
  end if;

  select c.project_id, c.inspection_id into v_project, v_inspection from public.captures c where c.id = p_capture_id;
  if not found then
    raise exception 'capture_not_found' using errcode = 'P0002';
  end if;

  select r.status into v_status from public.ai_runs r where r.capture_id = p_capture_id;
  if v_status = 'done' then
    return jsonb_build_object('status', 'already_done');
  end if;

  perform set_config('nexus.ai_run', 'on', true);

  if p_error is not null then
    insert into public.ai_runs as r (capture_id, status, model, model_version, findings_count, attempts, last_error)
    values (p_capture_id, 'failed', p_model, p_version, 0, 1, left(p_error, 500))
    on conflict (capture_id) do update set status = 'failed', model = excluded.model,
      model_version = excluded.model_version, findings_count = 0,
      last_error = excluded.last_error, processed_at = now()
    where r.status <> 'done';
    perform set_config('nexus.ai_run', coalesce(v_prev, ''), true);
    return jsonb_build_object('status', 'failed');
  end if;

  v_finds := case when jsonb_typeof(p_manifest -> 'findings') = 'array' then p_manifest -> 'findings' else '[]'::jsonb end;
  v_count := jsonb_array_length(v_finds);

  if v_count > 0 then
    -- El manifiesto debe ser de esta foto
    if (p_manifest ->> 'project_id') is distinct from v_project::text
       or (p_manifest #>> '{inspection,id}') is distinct from v_inspection::text
       or exists (select 1 from jsonb_array_elements(v_finds) f
                  where f ->> 'capture_id' is distinct from p_capture_id::text
                     or f ->> 'source' is distinct from 'ai') then
      raise exception using errcode = '22023', message = 'manifest_invalid',
        detail = jsonb_build_array(jsonb_build_object('path', '', 'code', 'manifest_mismatch'))::text;
    end if;

    -- Solo los daños cuyo id no existe aún (idempotencia sin pisar correcciones humanas)
    select coalesce(jsonb_agg(f order by o), '[]'::jsonb) into v_new
    from jsonb_array_elements(v_finds) with ordinality x(f, o)
    where not exists (select 1 from public.findings e where e.id = (f ->> 'id')::uuid);

    if jsonb_array_length(v_new) > 0 then
      v_result := public.ingest_manifest(jsonb_set(jsonb_set(p_manifest, '{findings}', v_new), '{captures}', '[]'::jsonb));
    end if;
  end if;

  insert into public.ai_runs as r (capture_id, status, model, model_version, findings_count, attempts, last_error)
  values (p_capture_id, 'done', p_model, p_version, v_count, 1, null)
  on conflict (capture_id) do update set status = 'done', model = excluded.model,
    model_version = excluded.model_version, findings_count = excluded.findings_count,
    last_error = null, processed_at = now()
  where r.status <> 'done';

  perform set_config('nexus.ai_run', coalesce(v_prev, ''), true);
  return jsonb_build_object('status', 'done', 'findings', v_count, 'ingest', v_result);
end $$;
revoke execute on function public.ai_record_run(jsonb, uuid, text, text, text) from public, anon;
grant execute on function public.ai_record_run(jsonb, uuid, text, text, text) to authenticated;
