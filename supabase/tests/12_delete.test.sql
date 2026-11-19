begin;
\ir helpers.psql
select plan(104);

-- Captura el detalle de un error de ingest_manifest (con los permisos de quien llama)
create or replace function tests.ingest_error(p jsonb) returns text language plpgsql as $$
declare d text;
begin
  perform public.ingest_manifest(p);
  return 'ok';
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return coalesce(d, sqlerrm);
end $$;
grant execute on function tests.ingest_error(jsonb) to authenticated;

select w ->> 'org_a' as org_a, w ->> 'project_a' as project_a, w ->> 'inspection_a' as insp_a,
  w ->> 'capture_a' as cap_a, w ->> 'asset_a' as asset_a, w ->> 'site_a' as site_a,
  w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'tech_b' as tech_b, w ->> 'mgr_a' as mgr_a,
  w ->> 'inspection_b' as insp_b
from (select tests.make_world() as w) s \gset
select id as t_crack from public.finding_types where code = 'crack' \gset

-- Segundo proyecto de la misma organización, con otra inspección del mismo activo
insert into public.projects (organization_id, name, code) values (:'org_a', 'Proyecto A2', 'PA2') returning id as project_a2 \gset
insert into public.project_sites (project_id, site_id) values (:'project_a2', :'site_a');
insert into public.project_assignments (project_id, user_id) values (:'project_a2', :'tech_a');
insert into public.inspections (project_id, asset_id, kind) values (:'project_a2', :'asset_a', 'wind_blade') returning id as insp_a2 \gset
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px)
  values (:'project_a2', :'insp_a2', 'rgb', repeat('c', 64), 'c.jpg', 'o/c.jpg', 100, 100);

-- Inspección A: segunda captura térmica emparejada, tira, dos daños (uno por captura, uno por tira) y comentarios
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px, paired_capture_id)
  values (:'project_a', :'insp_a', 'thermal', repeat('d', 64), 'd.jpg', 'o/d.jpg', 100, 100, :'cap_a') returning id as cap_t \gset
insert into public.thermal_captures (capture_id, project_id) values (:'cap_t', :'project_a');
insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px)
  values (:'project_a', :'insp_a', 'blade_strip', 'rgb', 'A', 'LE', 'x/strip.webp', 1000, 100) returning id as mosaic_a \gset
update public.inspections set id_capture_id = :'cap_a' where id = :'insp_a';
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, status)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}', 'confirmed')
  returning id as f_cap \gset
insert into public.findings (project_id, inspection_id, mosaic_id, type_id, severity, region)
  values (:'project_a', :'insp_a', :'mosaic_a', :'t_crack', 2, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}');
insert into public.comments (project_id, inspection_id, finding_id, author_id, body)
  values (:'project_a', :'insp_a', :'f_cap', :'mgr_a', 'sobre el daño');
insert into public.comments (project_id, inspection_id, author_id, body)
  values (:'project_a', :'insp_a', :'mgr_a', 'sobre la inspección') returning id as c_insp \gset

-- Archivos de Storage: 2 de A (1000 y 2000 bytes), 1 de A2, 1 de otra organización
select :'org_a' || '/' || :'project_a' || '/' || :'insp_a' || '/captures/' || :'cap_a' || '/original.jpg' as path_a1 \gset
select :'org_a' || '/' || :'project_a' || '/' || :'insp_a' || '/mosaics/' || :'mosaic_a' || '/strip.webp' as path_a2 \gset
select :'org_a' || '/' || :'project_a2' || '/' || :'insp_a2' || '/captures/x/original.jpg' as path_x \gset
select (select organization_id from public.projects where id = (select project_id from public.inspections where id = :'insp_b'))
  || '/' || (select project_id from public.inspections where id = :'insp_b') || '/' || :'insp_b' || '/captures/y/original.jpg' as path_b \gset
-- Un objeto con el UUID de la organización en mayúsculas (storage_path_ids lo acepta): el borrado también lo ve
select upper(:'org_a') || '/' || :'project_a' || '/' || :'insp_a' || '/captures/UP/original.jpg' as path_up \gset
insert into storage.objects (bucket_id, name, metadata) values
  ('inspection-media', :'path_a1', '{"size": 1000}'), ('inspection-media', :'path_a2', '{"size": 2000}'),
  ('inspection-media', :'path_up', '{"size": 100}'),
  ('inspection-media', :'path_x', '{"size": 500}'), ('inspection-media', :'path_b', '{"size": 700}');

-- Inspección aprobada de otra máquina (A3) con dos daños confirmados y un archivo
insert into public.assets (organization_id, site_id, kind, name) values (:'org_a', :'site_a', 'wind_turbine', 'WTG-03') returning id as asset_a3 \gset
insert into public.inspections (project_id, asset_id, kind) values (:'project_a', :'asset_a3', 'wind_blade') returning id as insp_a3 \gset
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px)
  values (:'project_a', :'insp_a3', 'rgb', repeat('e', 64), 'e.jpg', 'o/e.jpg', 100, 100) returning id as cap_a3 \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, status)
  values (:'project_a', :'insp_a3', :'cap_a3', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}', 'confirmed') returning id as f_a3 \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, status)
  values (:'project_a', :'insp_a3', :'cap_a3', :'t_crack', 2, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}', 'confirmed') returning id as f_a3b \gset
update public.inspections set status = 'approved' where id = :'insp_a3';
select :'org_a' || '/' || :'project_a' || '/' || :'insp_a3' || '/captures/' || :'cap_a3' || '/original.jpg' as path_a3 \gset
insert into storage.objects (bucket_id, name, metadata) values ('inspection-media', :'path_a3', '{"size": 400}');

select count(*) as cl_before from public.change_log where project_id = :'project_a'::uuid \gset

-- Existencia y permisos
select has_function('public', 'deletion_preview', array['text', 'uuid', 'uuid'], 'existe deletion_preview');
select has_function('public', 'deletion_objects', array['uuid', 'integer'], 'existe deletion_objects');
select has_function('public', 'begin_inspection_delete', array['uuid', 'text'], 'existe begin_inspection_delete');
select has_function('public', 'begin_scope_delete', array['text', 'uuid', 'uuid', 'text'], 'existe begin_scope_delete');
select has_function('public', 'finish_inspection_delete', array['uuid'], 'existe finish_inspection_delete');
select has_function('public', 'delete_project_row', array['uuid', 'text'], 'existe delete_project_row');
select ok((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('deletion_preview', 'deletion_objects',
    'begin_inspection_delete', 'begin_scope_delete', 'finish_inspection_delete', 'delete_project_row')),
  'las funciones son security definer con search_path vacío');
select ok((select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('deletion_preview', 'deletion_objects',
    'begin_inspection_delete', 'begin_scope_delete', 'finish_inspection_delete', 'delete_project_row')),
  'anon no ejecuta y authenticated sí');

-- Quien no es admin no puede llamar a ninguna función (técnico y cliente: not_allowed; anon: sin permiso)
select tests.login_as(:'tech_a');
select throws_ok(q, '42501', 'not_allowed', 'tech_a: ' || left(q, 40)) from unnest(array[
  format('select public.deletion_preview(%L, %L)', 'inspection', :'insp_a'),
  format('select * from public.deletion_objects(%L)', :'insp_a'),
  format('select public.begin_inspection_delete(%L)', :'insp_a'),
  format('select public.begin_scope_delete(%L, %L)', 'project', :'project_a'),
  format('select public.finish_inspection_delete(%L)', :'insp_a'),
  format('select public.delete_project_row(%L)', :'project_a')]) q;
select tests.login_as(:'mgr_a');
select throws_ok(q, '42501', 'not_allowed', 'mgr_a: ' || left(q, 40)) from unnest(array[
  format('select public.deletion_preview(%L, %L)', 'inspection', :'insp_a'),
  format('select * from public.deletion_objects(%L)', :'insp_a'),
  format('select public.begin_inspection_delete(%L)', :'insp_a'),
  format('select public.begin_scope_delete(%L, %L)', 'project', :'project_a'),
  format('select public.finish_inspection_delete(%L)', :'insp_a'),
  format('select public.delete_project_row(%L)', :'project_a')]) q;
select tests.login_anon();
select throws_ok(q, '42501', null, 'anon: ' || left(q, 40)) from unnest(array[
  format('select public.deletion_preview(%L, %L)', 'inspection', :'insp_a'),
  format('select * from public.deletion_objects(%L)', :'insp_a'),
  format('select public.begin_inspection_delete(%L)', :'insp_a'),
  format('select public.begin_scope_delete(%L, %L)', 'project', :'project_a'),
  format('select public.finish_inspection_delete(%L)', :'insp_a'),
  format('select public.delete_project_row(%L)', :'project_a')]) q;
select tests.logout();

-- Resumen previo (admin)
select tests.login_as(:'admin');
select deletion_preview as pv from public.deletion_preview('inspection', :'insp_a') \gset
select ok(:'pv'::jsonb @> '{"inspections":1,"captures":2,"mosaics":1,"findings":2,"comments":2,"objects":3,"bytes":3100,"approved":0,"pending":0}',
  'vista previa de una inspección: conteos, objetos y bytes');
select is(:'pv'::jsonb ->> 'confirm_name', 'WTG-01', 'la confirmación es el nombre del activo');
select deletion_preview as pva from public.deletion_preview('asset_inspections', :'asset_a') \gset
select ok(:'pva'::jsonb @> '{"inspections":2,"captures":3,"objects":4,"bytes":3600}'
  and jsonb_array_length((:'pva'::jsonb) -> 'projects') = 2, 'vista previa por máquina: todas sus inspecciones y los proyectos afectados');
select deletion_preview as pvf from public.deletion_preview('asset_inspections', :'asset_a', :'project_a') \gset
select ok(:'pvf'::jsonb @> '{"inspections":1,"bytes":3100}' and jsonb_array_length((:'pvf'::jsonb) -> 'projects') = 1,
  'vista previa por máquina con filtro de proyecto');
select deletion_preview as pvp from public.deletion_preview('project', :'project_a') \gset
select ok(:'pvp'::jsonb @> '{"inspections":2,"project_sites":1,"assignments":2,"confirm_name":"Proyecto A"}',
  'vista previa de un proyecto: inspecciones, sitios ligados y asignaciones');
select throws_ok(format('select public.deletion_preview(%L, %L)', 'inspection', gen_random_uuid()), 'P0002', 'not_found', 'id inexistente');
select throws_ok(format('select public.deletion_preview(%L, %L)', 'otro', :'insp_a'), '22023', 'invalid_kind', 'tipo no válido');
select is((select count(*) from public.deletion_objects(:'insp_a')), 3::bigint, 'deletion_objects lista los objetos del prefijo, también el de UUID en mayúsculas, y solo los de la inspección');
select is((select count(*) from public.deletion_objects(:'insp_a', 1)), 1::bigint, 'deletion_objects respeta el límite');
select tests.logout();

-- Antes de marcar: el técnico ve la inspección; no se puede cerrar sin marcar
select tests.login_as(:'tech_a');
select is((select count(*) from public.inspections where id = :'insp_a'), 1::bigint, 'antes: tech_a ve la inspección');
select throws_ok(format('update public.inspections set deleting_at = now() where id = %L', :'insp_a'), 'P0001', 'system_column',
  'tech_a no escribe deleting_at');
select tests.login_as(:'admin');
select throws_ok(format('update public.inspections set deleting_at = now() where id = %L', :'insp_a'), 'P0001', 'system_column',
  'ni el admin escribe deleting_at por fuera de las funciones');
select throws_ok(format('select public.finish_inspection_delete(%L)', :'insp_a'), 'P0001', 'not_marked', 'finish exige marcar antes');
select tests.logout();

-- Control: antes de marcar, el cliente edita su comentario y revisa un daño de una inspección aprobada
select tests.login_as(:'mgr_a');
select is(tests.affected(format('update public.comments set body = ''antes'' where id = %L', :'c_insp')), 1::bigint, 'antes de marcar, mgr_a edita su comentario');
select lives_ok(format('select public.mark_finding_reviewed(%L)', :'f_a3b'), 'antes de marcar, mgr_a revisa un daño confirmado de una inspección aprobada');
select tests.logout();

-- Envoltorio de ingest_manifest y función núcleo
select ok((select not prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.ingest_manifest(jsonb)'::regprocedure),
  'ingest_manifest: security invoker con search_path vacío');
select ok(not has_function_privilege('anon', 'public.ingest_manifest(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.ingest_manifest(jsonb)', 'execute'), 'ingest_manifest: anon sin EXECUTE, authenticated con EXECUTE');
select ok(not has_function_privilege('anon', 'private.ingest_manifest_core(jsonb)', 'execute'), 'ingest_manifest_core: anon sin EXECUTE');
select ok((select not prosecdef from pg_proc where oid = 'private.ingest_manifest_core(jsonb)'::regprocedure), 'ingest_manifest_core sigue siendo security invoker');

-- Marcar la inspección A
select tests.login_as(:'admin');
select public.begin_inspection_delete(:'insp_a', 'prueba de borrado') as op \gset
select tests.logout();
select ok((select deleting_at is not null from public.inspections where id = :'insp_a'), 'la inspección queda marcada');
select ok((select count(*) = 1 and bool_and(status = 'started' and kind = 'inspection' and name = 'WTG-01' and reason = 'prueba de borrado'
    and bytes = 3100 and (counts ->> 'captures')::int = 2 and (counts ->> 'findings')::int = 2)
  from public.deletion_log where entity_id = :'insp_a'::uuid and operation_id = :'op'::uuid), 'el inicio queda en deletion_log con conteos y bytes');
select tests.login_as(:'admin');
select is(public.begin_inspection_delete(:'insp_a'), :'op'::uuid, 'marcar de nuevo es idempotente (misma operación)');
select tests.logout();
select is((select count(*) from public.deletion_log where entity_id = :'insp_a'::uuid), 1::bigint, 'y no duplica el registro');

-- Guardas sobre la inspección en eliminación
select tests.login_as(:'tech_a');
select is((select count(*) from public.inspections where id = :'insp_a'), 0::bigint, 'tech_a ya no ve la inspección');
select is((select count(*) from public.captures where inspection_id = :'insp_a')
  + (select count(*) from public.mosaics where inspection_id = :'insp_a')
  + (select count(*) from public.findings where inspection_id = :'insp_a')
  + (select count(*) from public.comments where inspection_id = :'insp_a')
  + (select count(*) from public.blade_captures where project_id = :'project_a')
  + (select count(*) from public.thermal_captures where project_id = :'project_a'), 0::bigint,
  'tech_a no ve fotos, tiras, daños, comentarios ni datos de pala/térmicos');
select is((select count(*) from storage.objects where bucket_id = 'inspection-media' and name = :'path_a1'), 0::bigint, 'tech_a no lee los archivos');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)',
  :'org_a' || '/' || :'project_a' || '/' || :'insp_a' || '/captures/z/original.jpg', :'tech_a'), '42501', null,
  'storage_can_write rechaza subir a la inspección en eliminación');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', %L, ''z.jpg'', ''o/z.jpg'', 10, 10)',
  :'project_a', :'insp_a', repeat('f', 64)), '42501', null, 'la RLS rechaza insertar capturas en la inspección en eliminación');
select throws_ok(format('insert into public.comments (project_id, inspection_id, author_id, body) values (%L, %L, %L, ''nuevo'')', :'project_a', :'insp_a', :'tech_a'),
  '42501', null, 'tech_a no comenta en la inspección en eliminación');
select is(tests.ingest_error(jsonb_build_object('manifest_version', 1, 'project_id', :'project_a',
  'inspection', jsonb_build_object('id', :'insp_a', 'asset_id', :'asset_a', 'kind', 'wind_blade'), 'captures', '[]'::jsonb))::jsonb,
  '[{"path": "/inspection/id", "code": "inspection_deleting"}]'::jsonb, 'ingest_manifest rechaza la inspección en eliminación');
select is((select count(*) from public.inspections where id = :'insp_a2'), 1::bigint, 'la otra inspección sigue visible');
select tests.login_as(:'mgr_a');
select throws_ok(format('insert into public.comments (project_id, inspection_id, author_id, body) values (%L, %L, %L, ''nuevo'')', :'project_a', :'insp_a', :'mgr_a'),
  '42501', null, 'mgr_a no comenta en la inspección en eliminación');
select is(tests.affected(format('update public.comments set body = ''despues'' where id = %L', :'c_insp')), 0::bigint, 'mgr_a no edita su comentario en la inspección en eliminación');
select is((select count(*) from public.inspections where id = :'insp_a'), 0::bigint, 'mgr_a (cliente) ya no ve la inspección');
select is((select count(*) from public.findings where inspection_id = :'insp_a') + (select count(*) from public.comments where inspection_id = :'insp_a'), 0::bigint,
  'mgr_a no ve daños ni comentarios');
select is((select count(*) from storage.objects where bucket_id = 'inspection-media' and name = :'path_a1'), 0::bigint, 'mgr_a no lee los archivos');
select tests.login_as(:'admin');
select is((select count(*) from public.inspections where id = :'insp_a' and deleting_at is not null), 1::bigint, 'el admin sigue viéndola (para reintentar)');
select is((select count(*) from public.captures where inspection_id = :'insp_a'), 2::bigint, 'y ve sus fotos');
select tests.logout();

-- finish falla mientras queden archivos; con los archivos fuera, borra en el orden correcto
select tests.login_as(:'admin');
select throws_ok(format('select public.finish_inspection_delete(%L)', :'insp_a'), 'P0001', 'objects_remaining', 'finish falla si quedan objetos (el de UUID en mayúsculas sigue ahí)');
select tests.logout();
select is((select count(*) from public.inspections where id = :'insp_a'), 1::bigint, 'y no borró nada');
-- La API de Storage borra los archivos; en la prueba se simula saltando el trigger que protege storage.objects
set local session_replication_role = replica;
delete from storage.objects where bucket_id = 'inspection-media' and name in (:'path_a1', :'path_a2');
set local session_replication_role = origin;
select tests.login_as(:'admin');
select throws_ok(format('select public.finish_inspection_delete(%L)', :'insp_a'), 'P0001', 'objects_remaining', 'finish también falla por el objeto con UUID en mayúsculas');
select tests.logout();
set local session_replication_role = replica;
delete from storage.objects where bucket_id = 'inspection-media' and name = :'path_up';
set local session_replication_role = origin;
select tests.login_as(:'admin');
select is((select count(*) from public.deletion_objects(:'insp_a')), 0::bigint, 'sin objetos que listar');
select public.finish_inspection_delete(:'insp_a') as fin \gset
select is(:'fin'::jsonb ->> 'status', 'deleted', 'finish borra la inspección (daño→captura/tira RESTRICT, id_capture, paired_capture)');
select is(public.finish_inspection_delete(:'insp_a') ->> 'status', 'already_deleted', 'finish es idempotente');
select tests.logout();

select is((select count(*) from public.inspections where id = :'insp_a')
  + (select count(*) from public.captures where inspection_id = :'insp_a')
  + (select count(*) from public.mosaics where inspection_id = :'insp_a')
  + (select count(*) from public.findings where inspection_id = :'insp_a')
  + (select count(*) from public.comments where inspection_id = :'insp_a')
  + (select count(*) from public.blade_captures where capture_id in (:'cap_a', :'cap_t'))
  + (select count(*) from public.thermal_captures where capture_id in (:'cap_a', :'cap_t')), 0::bigint,
  'no queda ninguna fila de la inspección');
select ok(exists (select 1 from public.projects where id = :'project_a') and exists (select 1 from public.assets where id = :'asset_a')
  and exists (select 1 from public.sites where id = :'site_a') and exists (select 1 from public.organizations where id = :'org_a')
  and exists (select 1 from public.inspections where id = :'insp_a2'), 'proyecto, activo, sitio, organización y la otra inspección se conservan');
select ok((select count(*) >= :cl_before::bigint from public.change_log where project_id = :'project_a'::uuid), 'change_log conserva todas sus filas');
select ok((select count(*) = 1 from public.change_log where table_name = 'inspections' and action = 'delete' and row_id = :'insp_a'::uuid)
  and (select count(*) = 2 from public.change_log where table_name = 'findings' and action = 'delete' and project_id = :'project_a'::uuid)
  and (select count(*) = 2 from public.change_log where table_name = 'captures' and action = 'delete' and project_id = :'project_a'::uuid)
  and (select count(*) = 1 from public.change_log where table_name = 'mosaics' and action = 'delete' and project_id = :'project_a'::uuid)
  and (select count(*) = 1 from public.change_log where table_name = 'inspections' and action = 'insert' and row_id = :'insp_a'::uuid),
  'change_log recibe las filas delete y conserva el insert original');
select ok((select count(*) = 1 and bool_and(counts ->> 'findings' = '2' and bytes = 3100 and reason = 'prueba de borrado' and kind = 'inspection')
  from public.deletion_log where entity_id = :'insp_a'::uuid and operation_id = :'op'::uuid and status = 'completed'),
  'el cierre queda en deletion_log con la misma operación');

-- deletion_log: inmutable y solo para el admin
select throws_ok('update public.deletion_log set reason = ''x''', 'P0001', 'deletion_log_immutable', 'postgres no actualiza deletion_log');
select throws_ok('delete from public.deletion_log', 'P0001', 'deletion_log_immutable', 'postgres no borra deletion_log');
select throws_ok('truncate public.deletion_log', 'P0001', 'deletion_log_immutable', 'postgres no vacía deletion_log');
select tests.login_as(:'admin');
select throws_ok('update public.deletion_log set reason = ''x''', '42501', null, 'admin no actualiza deletion_log');
select throws_ok('delete from public.deletion_log', '42501', null, 'admin no borra deletion_log');
select throws_ok('insert into public.deletion_log (operation_id, status, kind, entity_type, entity_id) values (gen_random_uuid(), ''started'', ''inspection'', ''inspection'', gen_random_uuid())',
  '42501', null, 'admin no inserta en deletion_log');
select ok((select count(*) = 2 from public.deletion_log where entity_id = :'insp_a'::uuid), 'admin lee deletion_log');
select tests.login_as(:'tech_a');
select is((select count(*) from public.deletion_log), 0::bigint, 'tech_a no lee deletion_log');
select tests.login_as(:'mgr_a');
select is((select count(*) from public.deletion_log), 0::bigint, 'mgr_a no lee deletion_log');
select tests.logout();

-- Alcance por máquina y proyecto
select tests.login_as(:'admin');
select is(public.begin_scope_delete('asset_inspections', :'asset_a', :'project_a2'), array[:'insp_a2'::uuid], 'begin_scope_delete (máquina + proyecto) marca y devuelve las inspecciones');
select tests.logout();
select ok((select deleting_at is not null from public.inspections where id = :'insp_a2'), 'la inspección del alcance queda marcada');
select ok((select count(*) = 1 and bool_and(kind = 'asset_inspections') from public.deletion_log where entity_id = :'insp_a2'::uuid and status = 'started'),
  'el registro lleva el alcance asset_inspections');

-- Proyecto: no se borra con inspecciones
select tests.login_as(:'admin');
select throws_ok(format('select public.delete_project_row(%L)', :'project_a2'), 'P0001', 'inspections_remaining', 'no se borra un proyecto con inspecciones');
select tests.logout();
set local session_replication_role = replica;
delete from storage.objects where bucket_id = 'inspection-media' and name = :'path_x';
set local session_replication_role = origin;
select tests.login_as(:'admin');
select is(public.finish_inspection_delete(:'insp_a2') ->> 'status', 'deleted', 'finish de la inspección del segundo proyecto');
select is(public.delete_project_row(:'project_a2', 'cierre') ->> 'status', 'deleted', 'se borra el proyecto vacío');
select is(public.delete_project_row(:'project_a2') ->> 'status', 'already_deleted', 'y es idempotente');
select tests.logout();
select is((select count(*) from public.projects where id = :'project_a2')
  + (select count(*) from public.project_sites where project_id = :'project_a2')
  + (select count(*) from public.project_assignments where project_id = :'project_a2'), 0::bigint, 'proyecto, sitios ligados y asignaciones desaparecen');
select ok(exists (select 1 from public.sites where id = :'site_a') and exists (select 1 from public.assets where id = :'asset_a')
  and exists (select 1 from public.organizations where id = :'org_a') and exists (select 1 from public.profiles where id = :'tech_a')
  and exists (select 1 from public.projects where id = :'project_a'), 'sitio, activo, organización, usuario y el otro proyecto se conservan');
select ok((select count(*) = 1 and bool_and((counts ->> 'project_sites')::int = 1 and (counts ->> 'assignments')::int = 1
    and (counts ->> 'inspections')::int = 1 and reason = 'cierre' and name = 'Proyecto A2')
  from public.deletion_log where entity_type = 'project' and entity_id = :'project_a2'::uuid), 'el borrado del proyecto queda en deletion_log');
select ok((select count(*) >= 1 from public.change_log where project_id = :'project_a2'::uuid), 'change_log del proyecto borrado sigue ahí');

-- Datos de otra organización intactos
select is((select count(*) from storage.objects where bucket_id = 'inspection-media' and name = :'path_b'), 1::bigint, 'los archivos de otra inspección no se tocan');
select is((select count(*) from public.inspections where id = :'insp_b'), 1::bigint, 'la inspección de otra organización no se toca');

-- Inspección aprobada: flujo completo; el cliente no puede revisar daños una vez marcada
select tests.login_as(:'admin');
select ok((select (public.deletion_preview('inspection', :'insp_a3') ->> 'approved')::int = 1), 'la vista previa cuenta la inspección aprobada');
select lives_ok(format('select public.begin_inspection_delete(%L, %L)', :'insp_a3', 'aprobada'), 'el admin marca una inspección aprobada');
select tests.login_as(:'mgr_a');
select is((select count(*) from public.findings where inspection_id = :'insp_a3'), 0::bigint, 'el cliente ya no ve los daños confirmados de la inspección aprobada marcada');
select throws_ok(format('select public.mark_finding_reviewed(%L)', :'f_a3'), 'P0001', 'not_allowed', 'mark_finding_reviewed falla para el cliente en la inspección marcada');
select tests.logout();
set local session_replication_role = replica;
delete from storage.objects where bucket_id = 'inspection-media' and name = :'path_a3';
set local session_replication_role = origin;
select tests.login_as(:'admin');
select is(public.finish_inspection_delete(:'insp_a3') ->> 'status', 'deleted', 'finish borra la inspección aprobada (begin a finish completo)');
select tests.logout();
select is((select count(*) from public.inspections where id = :'insp_a3') + (select count(*) from public.findings where inspection_id = :'insp_a3')
  + (select count(*) from public.captures where inspection_id = :'insp_a3'), 0::bigint, 'la inspección aprobada y sus datos desaparecen');
select ok((select count(*) = 1 and bool_and(reason = 'aprobada' and bytes = 400) from public.deletion_log where entity_id = :'insp_a3'::uuid and status = 'completed'),
  'deletion_log registra el borrado de la aprobada');

select * from finish();
rollback;
