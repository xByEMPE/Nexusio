begin;
\ir helpers.psql
select plan(48);

select w ->> 'org_a' as org_a, w ->> 'project_a' as project_a, w ->> 'project_b' as project_b, w ->> 'inspection_a' as insp_a,
  w ->> 'asset_a' as asset_a, w ->> 'capture_a' as cap_a, w ->> 'capture_b' as cap_b, w ->> 'admin' as admin,
  w ->> 'tech_a' as tech_a, w ->> 'service_a' as service_a, w ->> 'mgr_a' as mgr_a
from (select tests.make_world() as w) s \gset

-- Manifiesto de IA de una foto con los daños de los ids dados
create or replace function tests.ai_manifest(p_project uuid, p_insp uuid, p_asset uuid, p_capture uuid, p_ids uuid[])
returns jsonb language sql as $$
  select jsonb_build_object(
    'manifest_version', 1, 'generated_at', '2026-11-18T10:00:00Z',
    'app', '{"name":"nexus-hf-detector","version":"1.0.0"}'::jsonb,
    'project_id', p_project,
    'inspection', jsonb_build_object('id', p_insp, 'asset_id', p_asset, 'kind', 'wind_blade'),
    'captures', '[]'::jsonb,
    'findings', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'capture_id', p_capture, 'type_code', 'ai_unclassified', 'severity', 3,
      'region', '{"type":"box","points":[[0.41,0.22],[0.47,0.30]]}'::jsonb,
      'source', 'ai', 'ai', '{"confidence":0.8,"model":"m","version":"1"}'::jsonb)) from unnest(p_ids) id), '[]'::jsonb));
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- Fotos extra de la inspección A (como postgres): c2 sin daños, c3 que falla, ct térmica.
-- Los originales usan rutas válidas ({org}/{proyecto}/{inspección}/...) para que la política de Storage los deje leer.
select :'org_a' || '/' || :'project_a' || '/' || :'insp_a' || '/captures/' as base \gset
select gen_random_uuid() as c2, gen_random_uuid() as c3, gen_random_uuid() as ct, gen_random_uuid() as f1,
  gen_random_uuid() as f2 \gset
insert into public.captures (id, project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px, gsd_mm_px)
values (:'c2', :'project_a', :'insp_a', 'rgb', repeat('2', 64), 'c2.jpg', (:'base' || :'c2' || '/original.jpg'), 5280, 3956, 0.6),
       (:'c3', :'project_a', :'insp_a', 'rgb', repeat('3', 64), 'c3.jpg', (:'base' || :'c3' || '/original.jpg'), 5280, 3956, 0.6),
       (:'ct', :'project_a', :'insp_a', 'thermal', repeat('4', 64), 'ct.jpg', (:'base' || :'ct' || '/original.jpg'), 640, 512, null);
-- Solo está subido el original de la foto A (por ahora)
update public.captures set original_path = :'base' || :'cap_a' || '/original.jpg' where id = :'cap_a';
insert into storage.objects (bucket_id, name) values ('inspection-media', :'base' || :'cap_a' || '/original.jpg');

select has_function('public', 'ai_pending_captures', array['integer'], 'existe ai_pending_captures');
select has_function('public', 'ai_start_run', array['uuid', 'text', 'text'], 'existe ai_start_run');
select has_function('public', 'ai_record_run', array['jsonb', 'uuid', 'text', 'text', 'text'], 'existe ai_record_run');
select ok((select not prosecdef from pg_proc where oid = 'public.ai_pending_captures(integer)'::regprocedure)
  and (select not prosecdef from pg_proc where oid = 'public.ai_record_run(jsonb,uuid,text,text,text)'::regprocedure),
  'las dos RPC son security invoker');
select ok(not has_function_privilege('anon', 'public.ai_record_run(jsonb,uuid,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.ai_pending_captures(integer)', 'execute'), 'anon no ejecuta las RPC');
select is((select label_es from public.finding_types where domain = 'wind_blade' and code = 'ai_unclassified'),
  'Daño detectado (IA)', 'tipo genérico sembrado');

-- Pendientes: solo la foto A (original subido, RGB); la térmica y las sin objeto no salen
select tests.login_as(:'service_a');
select is((select count(*) from public.ai_pending_captures(10)), 1::bigint, 'solo una foto pendiente (la de original subido)');
select ok((select capture_id = :'cap_a'::uuid and asset_id = :'asset_a'::uuid and width_px = 5280
  and original_path = (:'base' || :'cap_a' || '/original.jpg') and attempts = 0 from public.ai_pending_captures(10)), 'devuelve los datos de la foto');
select tests.logout();
insert into storage.objects (bucket_id, name) values ('inspection-media', :'base' || :'c2' || '/original.jpg'),
  ('inspection-media', :'base' || :'c3' || '/original.jpg'), ('inspection-media', :'base' || :'ct' || '/original.jpg');
select tests.login_as(:'service_a');
select is((select count(*) from public.ai_pending_captures(10)), 3::bigint, 'con los originales subidos hay tres RGB (la térmica no)');
select is((select count(*) from public.ai_pending_captures(1)), 1::bigint, 'respeta el límite');
select tests.logout();

-- Permisos: técnico y cliente no son el worker
select tests.login_as(:'tech_a');
select throws_ok('select * from public.ai_pending_captures(10)', '42501', 'not_allowed', 'el técnico no lista pendientes');
select throws_ok(format('select public.ai_record_run(null, %L, %L, %L)', :'cap_a', 'm', '1'), '42501', 'not_allowed',
  'el técnico no registra runs');
select tests.logout();
select tests.login_as(:'mgr_a');
select throws_ok('select * from public.ai_pending_captures(10)', '42501', 'not_allowed', 'el cliente no lista pendientes');
select tests.logout();

-- Éxito con un daño: ingesta + run 'done' atómicos
select tests.login_as(:'service_a');
select public.ai_record_run(tests.ai_manifest(:'project_a', :'insp_a', :'asset_a', :'cap_a', array[:'f1'::uuid]),
  :'cap_a', 'fasterrcnn', '1.0.0') as r1 \gset
select is(:'r1'::jsonb ->> 'status', 'done', 'run done');
select ok((select source = 'ai' and status = 'detected' and ai_confidence = 0.8 and ai_original is not null
  and corrected_at is null and capture_id = :'cap_a'::uuid
  and type_id = (select id from public.finding_types where domain = 'wind_blade' and code = 'ai_unclassified')
  from public.findings where id = :'f1'), 'daño de IA detectado con confianza y ai_original');
select ok((select status = 'done' and findings_count = 1 and attempts = 1 and model = 'fasterrcnn' and model_version = '1.0.0'
  and last_error is null from public.ai_runs where capture_id = :'cap_a'), 'fila de ai_runs correcta');
select ok(current_setting('nexus.ai_run', true) is distinct from 'on', 'nexus.ai_run se restaura');
select is((select count(*) from public.ai_pending_captures(10)), 2::bigint, 'la foto hecha ya no está pendiente');

-- Repetir no hace nada
select is(public.ai_record_run(tests.ai_manifest(:'project_a', :'insp_a', :'asset_a', :'cap_a', array[:'f2'::uuid]),
  :'cap_a', 'fasterrcnn', '1.0.0') ->> 'status', 'already_done', 'run done no se repite');
select is((select count(*) from public.findings where capture_id = :'cap_a'), 1::bigint, 'no se añadieron daños en el repetido');

-- Sin daños: solo se marca el run (nada de empty_manifest)
select is(public.ai_record_run(null, :'c2', 'fasterrcnn', '1.0.0') ->> 'status', 'done', 'sin daños: run done sin manifiesto');
select is(public.ai_record_run(tests.ai_manifest(:'project_a', :'insp_a', :'asset_a', :'ct', array[]::uuid[]),
  :'ct', 'fasterrcnn', '1.0.0') ->> 'status', 'done', 'manifiesto con findings vacío también solo marca el run');
select is((select findings_count from public.ai_runs where capture_id = :'c2'), 0, 'findings_count 0');

-- Manifiesto de otra foto o foto de otro proyecto
select throws_ok(format('select public.ai_record_run(%L::jsonb, %L, %L, %L)',
  tests.ai_manifest(:'project_a', :'insp_a', :'asset_a', :'cap_a', array[gen_random_uuid()]), :'c3', 'm', '1'),
  '22023', 'manifest_invalid', 'un manifiesto cuya foto no coincide se rechaza');
select throws_ok(format('select public.ai_record_run(null, %L, %L, %L)', :'cap_b', 'm', '1'), 'P0002', 'capture_not_found',
  'una foto de otro proyecto no existe para el worker');

-- Fallos y reintentos
select is(public.ai_record_run(null, :'c3', 'fasterrcnn', '1.0.0', 'boom') ->> 'status', 'failed', 'fallo registrado');
select ok((select status = 'failed' and attempts = 1 and last_error = 'boom' from public.ai_runs where capture_id = :'c3'),
  'failed con attempts 1');
select is((select count(*) from public.ai_pending_captures(10)), 0::bigint, 'la fallida espera 10 minutos antes de reintentarse');
select tests.logout();
update public.ai_runs set processed_at = now() - interval '11 minutes' where capture_id = :'c3';
select tests.login_as(:'service_a');
select is((select count(*) from public.ai_pending_captures(10)), 1::bigint, 'pasados 10 minutos vuelve a pendiente');
select is(public.ai_start_run(:'c3', 'fasterrcnn', '1.0.0') ->> 'attempts', '2', 'ai_start_run cuenta el intento antes de procesar');
select ok((select status = 'failed' and last_error = 'interrupted' from public.ai_runs where capture_id = :'c3'),
  'tras start, si el proceso muere queda failed/interrupted (no hay bucle de descargas)');
select public.ai_record_run(null, :'c3', 'fasterrcnn', '1.0.0', 'boom2');
select ok((select attempts = 2 and last_error = 'boom2' from public.ai_runs where capture_id = :'c3'),
  'el fallo registrado no vuelve a contar el intento');
select public.ai_start_run(:'c3', 'fasterrcnn', '1.0.0');
select is((select attempts from public.ai_runs where capture_id = :'c3'), 3, 'attempts sube con cada start');
select tests.logout();
update public.ai_runs set processed_at = now() - interval '1 day' where capture_id = :'c3';
select tests.login_as(:'service_a');
select is((select count(*) from public.ai_pending_captures(10)), 0::bigint, 'con 3 intentos ya no vuelve a pendiente');

-- Un fallo tardío no pisa un run done, ni start lo toca
select is(public.ai_record_run(null, :'c2', 'fasterrcnn', '1.0.0', 'tarde') ->> 'status', 'already_done', 'fallo tardío sobre done: ignorado');
select is(public.ai_start_run(:'c2', 'fasterrcnn', '1.0.0') ->> 'status', 'already_done', 'start sobre done: ignorado');
select ok((select status = 'done' and last_error is null and attempts = 1 from public.ai_runs where capture_id = :'c2'), 'el run done sigue intacto');

-- Manifiestos que no son de esta foto/inspección o no son de IA
select throws_ok(format('select public.ai_record_run(%L::jsonb, %L, %L, %L)',
  jsonb_set(tests.ai_manifest(:'project_a', :'insp_a', :'asset_a', :'c3', array[gen_random_uuid()]), '{findings,0,source}', '"manual"'),
  :'c3', 'm', '1'), '22023', 'manifest_invalid', 'un daño manual en el manifiesto se rechaza');
select throws_ok(format('select public.ai_record_run(%L::jsonb, %L, %L, %L)',
  jsonb_set(tests.ai_manifest(:'project_a', :'insp_a', :'asset_a', :'c3', array[gen_random_uuid()]), '{inspection,id}', to_jsonb(gen_random_uuid())),
  :'c3', 'm', '1'), '22023', 'manifest_invalid', 'un manifiesto de otra inspección se rechaza');

-- Escritura directa y borrado
select throws_ok(format('insert into public.ai_runs (capture_id, status, model, model_version) values (%L, %L, %L, %L)',
  :'cap_b', 'done', 'm', '1'), 'P0001', null, 'el service no inserta runs fuera de la RPC');
select is(tests.affected(format('delete from public.ai_runs where capture_id = %L', :'cap_a')), 0::bigint,
  'el service no borra runs');
select tests.logout();
-- Un técnico no se salta la guarda con set_config: la política exige ser worker
select tests.login_as(:'tech_a');
select set_config('nexus.ai_run', 'on', true);
select throws_ok(format('insert into public.ai_runs (capture_id, status, model, model_version) values (%L, %L, %L, %L)',
  :'cap_a', 'done', 'm', '1'), '42501', null, 'el técnico no inserta en ai_runs ni con nexus.ai_run');
select tests.logout();

-- Corrección humana + reproceso: el daño corregido no se toca
select tests.login_as(:'tech_a');
select is(tests.affected(format('update public.findings set severity = 5 where id = %L', :'f1')), 1::bigint, 'tech_a corrige el daño');
select tests.logout();
select tests.login_as(:'admin');
select is(tests.affected(format('delete from public.ai_runs where capture_id = %L', :'cap_a')), 1::bigint,
  'el admin borra el run para reprocesar');
select tests.logout();
select tests.login_as(:'service_a');
select public.ai_record_run(tests.ai_manifest(:'project_a', :'insp_a', :'asset_a', :'cap_a', array[:'f1'::uuid]),
  :'cap_a', 'fasterrcnn', '1.0.0');
select ok((select severity = 5 and corrected_at is not null and ai_original ->> 'severity' = '3'
  from public.findings where id = :'f1'), 'el reproceso no pisa la corrección y conserva ai_original');
select is((select count(*) from public.findings where capture_id = :'cap_a'), 1::bigint, 'el reproceso no duplica el daño');
select tests.logout();

-- Inspección aprobada o en borrado: no hay pendientes
delete from public.ai_runs where capture_id in (:'cap_a', :'c2', :'c3');
update public.inspections set status = 'approved' where id = :'insp_a';
select tests.login_as(:'service_a');
select is((select count(*) from public.ai_pending_captures(10)), 0::bigint, 'inspección aprobada: nada pendiente');
select tests.logout();
update public.inspections set status = 'in_review', deleting_at = now() where id = :'insp_a';
select tests.login_as(:'service_a');
select is((select count(*) from public.ai_pending_captures(10)), 0::bigint, 'inspección en borrado: nada pendiente');
select tests.logout();

select * from finish();
rollback;
