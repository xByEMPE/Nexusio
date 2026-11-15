begin;
\ir helpers.psql
select plan(21);

select w ->> 'org_a' as org_a, w ->> 'org_b' as org_b, w ->> 'project_a' as project_a, w ->> 'project_b' as project_b,
  w ->> 'inspection_a' as insp_a, w ->> 'inspection_b' as insp_b, w ->> 'capture_a' as cap_a, w ->> 'admin' as admin,
  w ->> 'tech_a' as tech_a, w ->> 'tech_b' as tech_b, w ->> 'mgr_a' as mgr_a, w ->> 'mgr_b' as mgr_b
from (select tests.make_world() as w) s \gset

select :'org_a' || '/' || :'project_a' || '/' || :'insp_a' || '/captures/' || :'cap_a' || '/original.jpg' as path_a \gset
select :'org_a' || '/' || :'project_a' || '/' || :'insp_a' as base_a \gset

select is((select public from storage.buckets where id = 'inspection-media'), false, 'el bucket es privado');
select ok((select 'image/tiff' = any(allowed_mime_types) and 'application/xml' = any(allowed_mime_types) and file_size_limit is null from storage.buckets where id = 'inspection-media'), 'tipos permitidos y sin límite propio');

-- storage_path_ids
select is((select count(*) from private.storage_path_ids(:'path_a')), 1::bigint, 'ruta válida devuelve una fila');
select is((select count(*) from private.storage_path_ids(:'org_a' || '/' || :'project_a' || '/../x')), 0::bigint, 'ruta con .. no es válida');
select is((select count(*) from private.storage_path_ids(:'org_a' || '//' || :'project_a' || '/' || :'insp_a' || '/x')), 0::bigint, 'ruta con // no es válida');
select is((select count(*) from private.storage_path_ids('/' || :'path_a')), 0::bigint, 'ruta con / inicial no es válida');
select is((select count(*) from private.storage_path_ids('a/b/c/d')), 0::bigint, 'segmentos no UUID no son válidos');

-- tech_a sube
select tests.login_as(:'tech_a');
select lives_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'path_a', :'tech_a'), 'tech_a sube a su inspección');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'org_b' || '/' || :'project_a' || '/' || :'insp_a' || '/x.jpg', :'tech_a'), '42501', null, 'organización que no corresponde al proyecto');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'org_a' || '/' || :'project_a' || '/../x', :'tech_a'), '42501', null, 'ruta inválida con ..');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'org_a' || '/' || :'project_a' || '/' || :'insp_b' || '/x.jpg', :'tech_a'), '42501', null, 'inspección de otro proyecto');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'org_b' || '/' || :'project_b' || '/' || :'insp_b' || '/x.jpg', :'tech_a'), '42501', null, 'proyecto no asignado');
select is((select count(*) from storage.objects where bucket_id = 'inspection-media'), 1::bigint, 'tech_a lee el objeto');

-- lectura
select tests.login_as(:'mgr_a');
select is((select count(*) from storage.objects where bucket_id = 'inspection-media'), 1::bigint, 'mgr_a lee el objeto de A');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'base_a' || '/y.jpg', :'mgr_a'), '42501', null, 'cliente no sube');
select tests.login_as(:'mgr_b');
select is((select count(*) from storage.objects where bucket_id = 'inspection-media'), 0::bigint, 'mgr_b no ve nada al listar');
select tests.login_as(:'tech_b');
select is(tests.affected(format('update storage.objects set metadata = ''{}'' where name = %L', :'path_a')), 0::bigint, 'tech_b no actualiza el objeto de A');

-- aprobada: tech_a no sube, admin sí
select tests.logout();
update public.inspections set status = 'approved' where id = :'insp_a';
select tests.login_as(:'tech_a');
select throws_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'base_a' || '/z.jpg', :'tech_a'), '42501', null, 'inspección aprobada: tech_a no sube');
select tests.login_as(:'admin');
select lives_ok(format('insert into storage.objects (bucket_id, name, owner) values (''inspection-media'', %L, %L)', :'base_a' || '/z.jpg', :'admin'), 'admin sube en inspección aprobada');

-- anon
select tests.login_anon();
select is((select count(*) from storage.objects where bucket_id = 'inspection-media'), 0::bigint, 'anon no lee');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (''inspection-media'', %L)', :'base_a' || '/w.jpg'), '42501', null, 'anon no sube');

select * from finish();
rollback;
