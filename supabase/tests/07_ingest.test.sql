begin;
\ir helpers.psql
select plan(60);

select w ->> 'org_a' as org_a, w ->> 'org_b' as org_b, w ->> 'project_a' as project_a, w ->> 'project_b' as project_b,
  w ->> 'inspection_a' as insp_a, w ->> 'inspection_b' as insp_b, w ->> 'asset_a' as asset_a, w ->> 'asset_b' as asset_b,
  w ->> 'capture_a' as cap_a, w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'tech_b' as tech_b,
  w ->> 'service_a' as service_a
from (select tests.make_world() as w) s \gset

-- Utilidades locales de la prueba
create or replace function tests.put_object(p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name) values ('inspection-media', p_name);
$$;

create or replace function tests.cap(p_id uuid, p_sha text, p_base text, p_blade boolean default true) returns jsonb
language sql as $$
  select jsonb_build_object(
    'id', p_id, 'sha256', p_sha, 'spectrum', 'rgb', 'file_name', p_id || '.jpg', 'sequence_index', 1,
    'paths', jsonb_build_object('original', p_base || '/captures/' || p_id || '/original.jpg'),
    'width_px', 5280, 'height_px', 3956,
    'gsd', jsonb_build_object('mm_px', 0.62, 'source', 'lrf', 'confidence', 'high'),
    'blade', case when p_blade then jsonb_build_object('position', 'A', 'face', 'LE', 'radius_center_m', 30) end);
$$;

create or replace function tests.finding(p_id uuid, p_capture uuid, p_code text default 'erosion_le',
  p_severity int default 3, p_source text default 'ai') returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'capture_id', p_capture, 'type_code', p_code, 'severity', p_severity,
    'region', '{"type":"box","points":[[0.41,0.22],[0.47,0.30]]}'::jsonb,
    'measurements', jsonb_build_object('width_mm', 85, 'length_mm', 140),
    'source', p_source,
    'ai', case when p_source = 'ai' then '{"confidence":0.87,"model":"blade-damage","version":"1.0.0"}'::jsonb end);
$$;

create or replace function tests.manifest(p_project uuid, p_insp uuid, p_asset uuid, p_caps jsonb, p_finds jsonb,
  p_mosaics jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object(
    'manifest_version', 1, 'generated_at', '2026-11-11T10:00:00Z',
    'app', '{"name":"nexus-desktop","version":"0.1.0"}'::jsonb,
    'project_id', p_project,
    'inspection', jsonb_build_object('id', p_insp, 'asset_id', p_asset, 'kind', 'wind_blade', 'pilot_name', 'Piloto'),
    'captures', p_caps, 'mosaics', p_mosaics, 'findings', p_finds);
$$;

-- Devuelve el detail (jsonb) de manifest_invalid, u otro error como {sqlstate, message}
create or replace function tests.ingest_error(p jsonb) returns jsonb language plpgsql as $$
declare d text; m text; s text;
begin
  perform public.ingest_manifest(p);
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail, m = message_text, s = returned_sqlstate;
  if s = '22023' and m = 'manifest_invalid' then
    return d::jsonb;
  end if;
  return jsonb_build_object('sqlstate', s, 'message', m);
end $$;
grant execute on all functions in schema tests to anon, authenticated;

select :'org_a' || '/' || :'project_a' || '/' || :'insp_a' as base_a \gset
select gen_random_uuid() as c1, gen_random_uuid() as c2, gen_random_uuid() as c3, gen_random_uuid() as c4,
  gen_random_uuid() as c5, gen_random_uuid() as c6, gen_random_uuid() as ct, gen_random_uuid() as mos,
  gen_random_uuid() as f1, gen_random_uuid() as f2, gen_random_uuid() as f3, gen_random_uuid() as fm \gset

-- Objetos citados (como postgres)
select tests.put_object(:'base_a' || '/captures/' || c || '/original.jpg')
from unnest(array[:'c1', :'c2', :'c3', :'c5', :'c6']::text[]) c;
select tests.put_object(:'base_a' || '/captures/' || :'c1' || '/preview.webp');

select jsonb_set(
  tests.manifest(:'project_a', :'insp_a', :'asset_a',
    jsonb_build_array(tests.cap(:'c1', repeat('1', 64), :'base_a'), tests.cap(:'c2', repeat('2', 64), :'base_a'),
      tests.cap(:'c3', repeat('3', 64), :'base_a')),
    jsonb_build_array(tests.finding(:'f1', :'c1'))),
  '{captures,0,paths,preview}', to_jsonb(:'base_a' || '/captures/' || :'c1' || '/preview.webp')) as m1 \gset

-- Firma de la función
select has_function('public', 'ingest_manifest', array['jsonb'], 'existe ingest_manifest(jsonb)');
select ok((select not prosecdef and provolatile = 'v' from pg_proc where oid = 'public.ingest_manifest(jsonb)'::regprocedure),
  'security invoker y volatile');
select ok(not has_function_privilege('anon', 'public.ingest_manifest(jsonb)', 'execute'), 'anon no ejecuta ingest_manifest');

-- 1. Primera subida: 3 fotos, 3 de pala y 1 daño de IA
select tests.login_as(:'tech_a');
select public.ingest_manifest(:'m1'::jsonb) as r1 \gset
select is((:'r1'::jsonb -> 'inserted'),
  '{"captures":3,"blade_captures":3,"thermal_captures":0,"mosaics":0,"findings":1}'::jsonb, 'inserted del primer manifiesto');
select is((:'r1'::jsonb -> 'updated'),
  '{"captures":0,"blade_captures":0,"thermal_captures":0,"mosaics":0,"findings":0}'::jsonb, 'updated vacío la primera vez');
select is((:'r1'::jsonb -> 'skipped'), '{"findings":[]}'::jsonb, 'nada omitido');
select is((select count(*) from public.captures where inspection_id = :'insp_a'), 4::bigint, 'cuatro fotos en la inspección');
select is((select preview_path from public.captures where id = :'c1'), :'base_a' || '/captures/' || :'c1' || '/preview.webp', 'preview_path guardado');
select ok((select gsd_mm_px = 0.62 and gsd_source = 'lrf' and gsd_confidence = 'high' from public.captures where id = :'c1'), 'gsd guardado');
select is((select status::text from public.inspections where id = :'insp_a'), 'in_review', 'la inspección pasa a in_review');
select is((select pilot_name from public.inspections where id = :'insp_a'), 'Piloto', 'datos de la inspección actualizados');
select ok((select source = 'ai' and ai_original is not null and corrected_at is null and created_by = :'tech_a'::uuid
  and ai_model = 'blade-damage' and ai_confidence = 0.87 and width_mm = 85 from public.findings where id = :'f1'),
  'daño de IA con ai_original, sin corrección');
select ok(current_setting('nexus.ingest', true) is distinct from 'on', 'nexus.ingest se restaura al terminar');

-- 2. Idempotente
select public.ingest_manifest(:'m1'::jsonb) as r2 \gset
select is((:'r2'::jsonb -> 'inserted'),
  '{"captures":0,"blade_captures":0,"thermal_captures":0,"mosaics":0,"findings":0}'::jsonb, 'repetir no inserta');
select is((:'r2'::jsonb -> 'updated'),
  '{"captures":3,"blade_captures":3,"thermal_captures":0,"mosaics":0,"findings":1}'::jsonb, 'repetir actualiza');
select is((select count(*) from public.captures where inspection_id = :'insp_a'), 4::bigint, 'sin filas nuevas');
select ok((select corrected_at is null from public.findings where id = :'f1'), 'la reingesta no marca corrección');

-- 3. Daño corregido no se sobrescribe
update public.findings set severity = 5 where id = :'f1';
select ok((select corrected_at is not null from public.findings where id = :'f1'), 'tech_a corrige el daño');
select public.ingest_manifest(:'m1'::jsonb) as r3 \gset
select is((:'r3'::jsonb -> 'skipped' -> 'findings'), jsonb_build_array(:'f1'), 'el daño corregido aparece en skipped');
select is((:'r3'::jsonb #>> '{updated,findings}')::int, 0, 'el daño corregido no cuenta como actualizado');
select is((select severity from public.findings where id = :'f1'), 5::smallint, 'la corrección se conserva');

-- 4. Térmica emparejada, tira y daño sobre la tira
select tests.logout();
select tests.put_object(:'base_a' || '/captures/' || :'ct' || '/original.jpg');
select tests.put_object(:'base_a' || '/captures/' || :'ct' || '/thermal.png');
select tests.put_object(:'base_a' || '/mosaics/' || :'mos' || '/strip.dzi');
select tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(
    tests.cap(:'ct', repeat('4', 64), :'base_a', false) || jsonb_build_object('spectrum', 'thermal',
      'paired_capture_id', :'c1',
      'thermal', jsonb_build_object('matrix_path', :'base_a' || '/captures/' || :'ct' || '/thermal.png', 't_max_c', 31.7))),
  jsonb_build_array(jsonb_build_object('id', :'fm', 'mosaic_id', :'mos', 'type_code', 'crack', 'severity', 2,
    'region', '{"type":"polygon","points":[[0,0],[1,0],[1,1]]}'::jsonb, 'source', 'manual')),
  jsonb_build_array(jsonb_build_object('id', :'mos', 'kind', 'blade_strip', 'spectrum', 'rgb', 'blade', 'A', 'face', 'LE',
    'format', 'dzi', 'path', :'base_a' || '/mosaics/' || :'mos' || '/strip.dzi', 'width_px', 4000, 'height_px', 120000,
    'calibration', jsonb_build_object('mm_per_px', 0.5, 'blade_length_m', 61.2)))) as mt \gset
select tests.login_as(:'tech_a');
select public.ingest_manifest(:'mt'::jsonb) as rt \gset
select is((:'rt'::jsonb -> 'inserted'),
  '{"captures":1,"blade_captures":0,"thermal_captures":1,"mosaics":1,"findings":1}'::jsonb, 'térmica, tira y daño manual');
select ok((select paired_capture_id = :'c1'::uuid from public.captures where id = :'ct'), 'pareja RGB/térmica guardada');
select ok((select temp_scale = 0.01 and temp_offset = -100 and t_max_c = 31.7 from public.thermal_captures where capture_id = :'ct'),
  'térmica con escala por defecto');
select ok((select mm_per_px = 0.5 and calibrated_by = :'tech_a'::uuid and format = 'dzi' from public.mosaics where id = :'mos'),
  'tira con calibración');
select ok((select source = 'manual' and ai_original is null from public.findings where id = :'fm'), 'daño manual sin ai_original');

-- 5. Solo daños (Hugging Face) con la cuenta service sobre una foto ya guardada
select tests.login_as(:'service_a');
select public.ingest_manifest(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'f2', :'cap_a', 'crack')))) as r5 \gset
select is((:'r5'::jsonb -> 'inserted'),
  '{"captures":0,"blade_captures":0,"thermal_captures":0,"mosaics":0,"findings":1}'::jsonb, 'manifiesto de solo daños');
select is((select capture_id from public.findings where id = :'f2'), :'cap_a'::uuid, 'el daño apunta a la foto existente');
select is(tests.affected(format('delete from public.findings where inspection_id = %L', :'insp_a')), 0::bigint,
  'service_a no borra daños');

-- 6. Todo o nada: un objeto faltante impide todo
select tests.login_as(:'tech_a');
select count(*) as n_before from public.captures \gset
select tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c5', repeat('5', 64), :'base_a'), tests.cap(:'c4', repeat('6', 64), :'base_a')),
  '[]'::jsonb)) as e6 \gset
select is(:'e6'::jsonb, '[{"path":"/captures/1/paths/original","code":"missing_object"}]'::jsonb, 'objeto faltante: missing_object');
select is((select count(*) from public.captures), :'n_before'::bigint, 'nada quedó insertado');
select throws_ok(format('select public.ingest_manifest(%L::jsonb)', tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c4', repeat('6', 64), :'base_a')), '[]'::jsonb)), '22023', 'manifest_invalid',
  'el error es 22023 manifest_invalid');

-- 7. Rutas ajenas o inválidas
select tests.logout();
insert into public.assets (organization_id, site_id, kind, name)
  values (:'org_a', (select site_id from public.assets where id = :'asset_a'), 'wind_turbine', 'WTG-02') returning id as asset_2 \gset
insert into public.inspections (project_id, asset_id, kind) values (:'project_a', :'asset_2', 'wind_blade') returning id as insp_2 \gset
select :'org_a' || '/' || :'project_a' || '/' || :'insp_2' as base_2 \gset
select :'org_b' || '/' || :'project_a' || '/' || :'insp_a' as base_ob \gset
select tests.put_object(:'base_2' || '/captures/' || :'c4' || '/original.jpg');
select tests.login_as(:'tech_a');
select ok(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c4', repeat('6', 64), :'base_a' || '/captures/' || :'c4' || '/..')), '[]'::jsonb))
  @> '[{"path":"/captures/0/paths/original","code":"bad_path"}]', 'ruta con .. : bad_path');
select ok(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c4', repeat('6', 64), :'base_2')), '[]'::jsonb))
  @> '[{"code":"bad_path"}]', 'ruta de otra inspección del mismo proyecto: bad_path');
select ok(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c4', repeat('6', 64), :'base_ob')), '[]'::jsonb))
  @> '[{"code":"bad_path"}]', 'ruta con la organización B: bad_path');
select ok(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(jsonb_set(tests.cap(:'c4', repeat('6', 64), :'base_a'), '{paths,original}',
    to_jsonb(:'base_a' || '/captures/' || :'c1' || '/original.jpg'))), '[]'::jsonb))
  @> '[{"code":"bad_path"}]', 'ruta de otra foto de la misma inspección: bad_path');
select ok(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(jsonb_set(tests.cap(:'c5', repeat('5', 64), :'base_a'), '{paths,original}',
    to_jsonb(:'base_a' || '/captures/' || :'c5' || '//original.jpg'))), '[]'::jsonb))
  @> '[{"code":"bad_path"}]', 'ruta con //: bad_path');

-- 8. Duplicados, referencias y catálogo
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c6', repeat('1', 64), :'base_a')), '[]'::jsonb)),
  '[{"path":"/captures/0/sha256","code":"duplicate_sha256"}]'::jsonb, 'mismo sha256 con otro id: duplicate_sha256');
select ok(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c5', repeat('7', 64), :'base_a'), tests.cap(:'c6', repeat('7', 64), :'base_a')), '[]'::jsonb))
  @> '[{"path":"/captures/0/sha256","code":"duplicate_sha256"},{"path":"/captures/1/sha256","code":"duplicate_sha256"}]',
  'sha256 repetido dentro del manifiesto');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'f3', :'c1', 'no_existe')))),
  '[{"path":"/findings/0/type_code","code":"unknown_finding_type"}]'::jsonb, 'tipo de daño desconocido');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'f3', gen_random_uuid())))),
  '[{"path":"/findings/0/capture_id","code":"unknown_capture"}]'::jsonb, 'foto desconocida');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array((tests.finding(:'f3', :'c1') - 'capture_id') || jsonb_build_object('mosaic_id', gen_random_uuid())))),
  '[{"path":"/findings/0/mosaic_id","code":"unknown_mosaic"}]'::jsonb, 'tira desconocida: unknown_mosaic');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_b', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'f3', :'c1')))),
  '[{"path":"/inspection/asset_id","code":"asset_other_org"}]'::jsonb, 'activo de otra organización');
select is(tests.ingest_error(jsonb_set(:'m1'::jsonb, '{manifest_version}', '2')),
  '[{"path":"/manifest_version","code":"unsupported_version"}]'::jsonb, 'versión no soportada');
select is((select count(*) from public.findings where id = :'f3'), 0::bigint, 'ningún error dejó daños');

select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'c5', repeat('5', 64), :'base_a'), tests.cap(:'c5', repeat('8', 64), :'base_a')), '[]'::jsonb)),
  '[{"path":"/captures/0/id","code":"duplicate_id"},{"path":"/captures/1/id","code":"duplicate_id"}]'::jsonb,
  'id de foto repetido en el manifiesto: duplicate_id');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'f3', :'c1'), tests.finding(:'f3', :'c2')))),
  '[{"path":"/findings/0/id","code":"duplicate_id"},{"path":"/findings/1/id","code":"duplicate_id"}]'::jsonb,
  'id de daño repetido en el manifiesto: duplicate_id');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb, '[]'::jsonb)),
  '[{"path":"","code":"empty_manifest"}]'::jsonb, 'manifiesto vacío: empty_manifest');

-- Un daño guardado no cambia de foto, de tira ni de origen
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'f1', :'c2')))),
  '[{"path":"/findings/0/capture_id","code":"finding_target_changed"}]'::jsonb, 'daño movido a otra foto: finding_target_changed');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'f2', :'cap_a', 'crack', 3, 'manual')))),
  '[{"path":"/findings/0/source","code":"finding_target_changed"}]'::jsonb, 'daño con otro origen: finding_target_changed');
select is(tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a', '[]'::jsonb,
  jsonb_build_array(tests.finding(:'fm', :'c1', 'crack', 4, 'manual')))),
  '[{"path":"/findings/0/capture_id","code":"finding_target_changed"},{"path":"/findings/0/mosaic_id","code":"finding_target_changed"}]'::jsonb,
  'daño de tira movido a una foto: finding_target_changed');
select ok((select mosaic_id = :'mos'::uuid and capture_id is null and severity = 2 from public.findings where id = :'fm'),
  'el daño de la tira no cambió');

-- 9. Permisos
select tests.login_as(:'tech_b');
select is(tests.ingest_error(:'m1'::jsonb), '[{"path":"/project_id","code":"forbidden_project"}]'::jsonb,
  'tech_b sobre el proyecto A: forbidden_project');

-- 10. 600 fotos en menos de 10 s (inspección 2)
select tests.logout();
insert into storage.objects (bucket_id, name)
  select 'inspection-media', :'base_2' || '/captures/' || gen_random_uuid() || '/original.jpg' from generate_series(1, 600);
select tests.manifest(:'project_a', :'insp_2', :'asset_2',
  (select jsonb_agg(tests.cap(split_part(o.name, '/', 5)::uuid, encode(sha256(o.name::bytea), 'hex'), :'base_2'))
   from storage.objects o where o.bucket_id = 'inspection-media' and o.name like :'base_2' || '/captures/%'
     and split_part(o.name, '/', 5) <> :'c4'),
  '[]'::jsonb) as m600 \gset
select tests.login_as(:'tech_a');
select clock_timestamp() as t0 \gset
select public.ingest_manifest(:'m600'::jsonb) as r600 \gset
select ok(clock_timestamp() - :'t0'::timestamptz < interval '10 seconds', '600 fotos en menos de 10 s');
select is((:'r600'::jsonb #>> '{inserted,captures}')::int, 600, '600 fotos insertadas');

-- Ids de otra inspección del mismo proyecto (tech_a está asignado a las dos)
select tests.logout();
select id as cap2, file_name as cap2_name from public.captures where inspection_id = :'insp_2' order by id limit 1 \gset
insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px)
  values (:'project_a', :'insp_2', 'blade_strip', 'rgb', 'A', 'LE', 'm/2.webp', 1000, 100) returning id as mos2 \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region)
  values (:'project_a', :'insp_2', :'cap2', (select id from public.finding_types where code = 'crack'), 2,
    '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}') returning id as find2 \gset
select tests.put_object(:'base_a' || '/captures/' || :'cap2' || '/original.jpg');
select tests.put_object(:'base_a' || '/mosaics/' || :'mos2' || '/strip.webp');
select tests.login_as(:'tech_a');
select tests.ingest_error(tests.manifest(:'project_a', :'insp_a', :'asset_a',
  jsonb_build_array(tests.cap(:'cap2', repeat('9', 64), :'base_a')),
  jsonb_build_array(tests.finding(:'find2', :'c1', 'erosion_le', 5)),
  jsonb_build_array(jsonb_build_object('id', :'mos2', 'kind', 'blade_strip', 'spectrum', 'rgb', 'blade', 'B', 'face', 'LE',
    'path', :'base_a' || '/mosaics/' || :'mos2' || '/strip.webp', 'width_px', 10, 'height_px', 10)))) as eforeign \gset
select is(:'eforeign'::jsonb, '[{"path":"/captures/0/id","code":"foreign_id"},{"path":"/mosaics/0/id","code":"foreign_id"},{"path":"/findings/0/id","code":"foreign_id"}]'::jsonb,
  'ids de otra inspección: foreign_id en foto, tira y daño');
select ok((select inspection_id = :'insp_2'::uuid and file_name = :'cap2_name' and sha256 <> repeat('9', 64)
  from public.captures where id = :'cap2'), 'la foto de la otra inspección no cambió');
select ok((select inspection_id = :'insp_2'::uuid and blade = 'A' and path = 'm/2.webp' from public.mosaics where id = :'mos2'),
  'la tira de la otra inspección no cambió');
select ok((select inspection_id = :'insp_2'::uuid and capture_id = :'cap2'::uuid and severity = 2
  from public.findings where id = :'find2'), 'el daño de la otra inspección no cambió');

-- 11. Inspección aprobada
select tests.logout();
update public.inspections set status = 'approved' where id = :'insp_a';
select tests.login_as(:'tech_a');
select is(tests.ingest_error(:'m1'::jsonb), '[{"path":"/inspection/id","code":"inspection_locked"}]'::jsonb,
  'inspección aprobada: inspection_locked');

select * from finish();
rollback;
