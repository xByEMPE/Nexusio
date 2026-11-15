begin;
\ir helpers.psql
select plan(26);

select w ->> 'org_a' as org_a, w ->> 'project_a' as project_a, w ->> 'inspection_a' as insp_a,
  w ->> 'asset_a' as asset_a, w ->> 'capture_a' as cap_a, w ->> 'admin' as admin, w ->> 'tech_a' as tech_a,
  w ->> 'service_a' as service_a, w ->> 'mgr_a' as mgr_a
from (select tests.make_world() as w) s \gset

select id as t_crack from public.finding_types where code = 'crack' \gset

-- Datos (como postgres): mosaico, captura libre de daños, daños con comentarios
insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px)
  values (:'project_a', :'insp_a', 'blade_strip', 'rgb', 'A', 'LE', 'm/a.webp', 1000, 100) returning id as mos_a \gset
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px)
  values (:'project_a', :'insp_a', 'rgb', repeat('c', 64), 'c.jpg', 'o/c.jpg', 10, 10) returning id as cap_free \gset
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px)
  values (:'project_a', :'insp_a', 'rgb', repeat('d', 64), 'd.jpg', 'o/d.jpg', 10, 10) returning id as cap_free2 \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}') returning id as f_cap \gset
insert into public.findings (project_id, inspection_id, mosaic_id, type_id, severity, region)
  values (:'project_a', :'insp_a', :'mos_a', :'t_crack', 2, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}') returning id as f_mos \gset
insert into public.comments (project_id, inspection_id, finding_id, author_id, body)
  values (:'project_a', :'insp_a', :'f_cap', :'mgr_a', 'comentario del cliente') returning id as c_mgr \gset

-- 1. Borrados indirectos por cascada (§6: solo admin borra daños; service no borra)
select ok(private.can_delete_inspection_data(:'project_a', :'insp_a') is false, 'postgres sin sesión no pasa can_delete_inspection_data');

select tests.login_as(:'tech_a');
select ok(private.can_delete_inspection_data(:'project_a', :'insp_a'), 'tech_a asignado puede borrar datos de A sin bloquear');
select throws_ok(format('delete from public.captures where id = %L', :'cap_a'), '23503', null,
  'tech_a no borra una captura con daños (FK restrict)');
select throws_ok(format('delete from public.mosaics where id = %L', :'mos_a'), '23503', null,
  'tech_a no borra un mosaico con daños (FK restrict)');
select is((select count(*) from public.findings where id in (:'f_cap', :'f_mos')), 2::bigint, 'los daños siguen intactos');
select is((select count(*) from public.comments where id = :'c_mgr'), 1::bigint, 'el comentario del cliente sigue intacto');
select is(tests.affected(format('delete from public.captures where id = %L', :'cap_free')), 1::bigint,
  'tech_a borra una captura sin daños en una inspección sin bloquear');
select tests.logout();

select tests.login_as(:'service_a');
select ok(not private.can_delete_inspection_data(:'project_a', :'insp_a'), 'service no pasa can_delete_inspection_data');
select ok(private.can_edit_inspection_data(:'project_a', :'insp_a'), 'service sigue pudiendo editar');
select is(tests.affected(format('delete from public.captures where id = %L', :'cap_free2')), 0::bigint, 'service no borra capturas');
select is(tests.affected(format('delete from public.blade_captures where capture_id = %L', :'cap_a')), 0::bigint, 'service no borra datos de pala');
select is(tests.affected(format('delete from public.mosaics where id = %L', :'mos_a')), 0::bigint, 'service no borra mosaicos');
select is((select count(*) from public.captures where id = :'cap_free2'), 1::bigint, 'la captura sigue ahí');
select tests.logout();

-- Inspección aprobada: tech_a ya no borra
update public.inspections set status = 'approved' where id = :'insp_a';
select tests.login_as(:'tech_a');
select is(tests.affected(format('delete from public.captures where id = %L', :'cap_free2')), 0::bigint, 'aprobada: tech_a no borra capturas');
select tests.logout();
update public.inspections set status = 'in_review' where id = :'insp_a';

-- Admin: primero quita los daños, luego borra la captura y el mosaico
select tests.login_as(:'admin');
select throws_ok(format('delete from public.captures where id = %L', :'cap_a'), '23503', null, 'admin tampoco borra una captura con daños');
select is(tests.affected(format('delete from public.findings where id in (%L, %L)', :'f_cap', :'f_mos')), 2::bigint, 'admin borra los daños');
select is(tests.affected(format('delete from public.captures where id = %L', :'cap_a')), 1::bigint, 'admin borra la captura tras quitar los daños');
select is(tests.affected(format('delete from public.mosaics where id = %L', :'mos_a')), 1::bigint, 'admin borra el mosaico tras quitar los daños');
select tests.logout();

-- 3. comments_delete exige usuario activo
insert into public.comments (project_id, inspection_id, author_id, body)
  values (:'project_a', :'insp_a', :'mgr_a', 'otro') returning id as c_mgr2 \gset
update public.profiles set is_active = false where id = :'mgr_a';
select tests.login_as(:'mgr_a');
select is(tests.affected(format('delete from public.comments where id = %L', :'c_mgr2')), 0::bigint, 'autor desactivado no borra su comentario');
select tests.logout();
update public.profiles set is_active = true where id = :'mgr_a';
select tests.login_as(:'mgr_a');
select is(tests.affected(format('delete from public.comments where id = %L', :'c_mgr2')), 1::bigint, 'autor activo borra su comentario');
select tests.logout();

-- Admin sigue pudiendo borrar una inspección entera (cascadas desde inspections)
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region)
  values (:'project_a', :'insp_a', :'cap_free2', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}') returning id as f_last \gset
insert into public.comments (project_id, inspection_id, finding_id, author_id, body)
  values (:'project_a', :'insp_a', :'f_last', :'mgr_a', 'x');
select tests.login_as(:'admin');
select is(tests.affected(format('delete from public.inspections where id = %L', :'insp_a')), 1::bigint,
  'admin borra una inspección con capturas, daños y comentarios');
select tests.logout();

-- 2. Inspección nueva: el cliente crea la fila antes de subir (§8.1 paso 3)
select gen_random_uuid() as new_insp, gen_random_uuid() as new_cap \gset
select :'org_a' || '/' || :'project_a' || '/' || :'new_insp' as base_new \gset
select tests.login_as(:'tech_a');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)',
  :'base_new' || '/captures/' || :'new_cap' || '/original.jpg', :'tech_a'), '42501', null,
  'sin fila de inspección no se puede subir');
select lives_ok(format('insert into public.inspections (id, project_id, asset_id, kind, status) values (%L, %L, %L, ''wind_blade'', ''captured'')',
  :'new_insp', :'project_a', :'asset_a'), 'tech_a crea la inspección nueva en un proyecto asignado');
select lives_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)',
  :'base_new' || '/captures/' || :'new_cap' || '/original.jpg', :'tech_a'), 'tech_a sube a la inspección recién creada');
select lives_ok(format('select public.ingest_manifest(%L::jsonb)', jsonb_build_object(
    'manifest_version', 1, 'generated_at', '2026-11-11T10:00:00Z',
    'app', '{"name":"nexus-desktop","version":"0.1.0"}'::jsonb,
    'project_id', :'project_a',
    'inspection', jsonb_build_object('id', :'new_insp', 'asset_id', :'asset_a', 'kind', 'wind_blade'),
    'captures', jsonb_build_array(jsonb_build_object(
      'id', :'new_cap', 'sha256', repeat('e', 64), 'spectrum', 'rgb', 'file_name', 'e.jpg', 'sequence_index', 1,
      'paths', jsonb_build_object('original', :'base_new' || '/captures/' || :'new_cap' || '/original.jpg'),
      'width_px', 5280, 'height_px', 3956,
      'blade', jsonb_build_object('position', 'A', 'face', 'LE'))),
    'mosaics', '[]'::jsonb, 'findings', '[]'::jsonb)), 'ingest_manifest acepta la inspección nueva');
select ok((select status = 'in_review' and (select count(*) from public.captures c where c.inspection_id = :'new_insp'::uuid) = 1
  from public.inspections where id = :'new_insp'), 'inspección nueva en in_review con su captura');
select tests.logout();

select * from finish();
rollback;
