begin;
\ir helpers.psql
select plan(17);

select w ->> 'org_a' as org_a, w ->> 'admin' as admin, w ->> 'asset_a' as asset_a, w ->> 'inspection_a' as insp_a, w ->> 'project_a' as project_a, w ->> 'site_a' as site_a, w ->> 'tech_a' as tech_a,
  w ->> 'mgr_a' as mgr_a
from (select tests.make_world() as w) s \gset

-- Activos extra para crear inspecciones nuevas en el proyecto A
insert into public.assets (organization_id, site_id, kind, name) values (:'org_a', :'site_a', 'wind_turbine', 'WTG-02') returning id as a2 \gset
insert into public.assets (organization_id, site_id, kind, name) values (:'org_a', :'site_a', 'wind_turbine', 'WTG-03') returning id as a3 \gset
insert into public.assets (organization_id, site_id, kind, name) values (:'org_a', :'site_a', 'wind_turbine', 'WTG-04') returning id as a4 \gset
insert into public.assets (organization_id, site_id, kind, name) values (:'org_a', :'site_a', 'wind_turbine', 'WTG-05') returning id as a5 \gset

select ok((select count(*) = 3 from information_schema.columns where table_schema = 'public' and table_name = 'projects'
  and column_name in ('default_pilot_name', 'default_assistant_name', 'default_drone_model')), 'projects tiene las tres columnas default_*');

-- Sin defaults en el proyecto: la inspección existente conserva nulos
select is((select count(*) from public.inspections where project_id = :'project_a' and pilot_name is null and assistant_name is null and drone_model is null),
  1::bigint, 'sin defaults, la inspección existente conserva nulos');

update public.projects set default_pilot_name = 'Ana Pérez, Luis Gómez', default_assistant_name = 'Marta Ruiz', default_drone_model = 'DJI M300'
  where id = :'project_a';

-- Alta como técnico asignado (el camino de la app de escritorio, por RLS directo)
select tests.login_as(:'tech_a');
insert into public.inspections (project_id, asset_id, kind) values (:'project_a', :'a2', 'wind_blade') returning id as i2 \gset
select tests.logout();
select is((select pilot_name || '|' || assistant_name || '|' || drone_model from public.inspections where id = :'i2'),
  'Ana Pérez, Luis Gómez|Marta Ruiz|DJI M300', 'el alta por RLS copia piloto, asistente y dron del proyecto');

-- Vacíos o solo espacios se tratan como ausentes
insert into public.inspections (project_id, asset_id, kind, pilot_name, assistant_name) values (:'project_a', :'a3', 'wind_blade', '   ', '')
  returning id as i3 \gset
select is((select pilot_name || '|' || assistant_name || '|' || drone_model from public.inspections where id = :'i3'),
  'Ana Pérez, Luis Gómez|Marta Ruiz|DJI M300', 'vacíos y espacios se rellenan con los defaults');

-- Lo enviado gana; solo se completa lo que falta
insert into public.inspections (project_id, asset_id, kind, pilot_name) values (:'project_a', :'a4', 'wind_blade', 'Piloto propio')
  returning id as i4 \gset
select is((select pilot_name || '|' || assistant_name || '|' || drone_model from public.inspections where id = :'i4'),
  'Piloto propio|Marta Ruiz|DJI M300', 'un valor enviado no se pisa y el resto se completa');

-- Cambiar los defaults después no altera inspecciones ya creadas
update public.projects set default_pilot_name = 'Otro piloto' where id = :'project_a';
select is((select pilot_name from public.inspections where id = :'i2'), 'Ana Pérez, Luis Gómez', 'las inspecciones ya creadas no cambian');

-- Defaults parciales: nulos y espacios no se copian
update public.projects set default_pilot_name = null, default_assistant_name = '  ', default_drone_model = 'Mavic 3' where id = :'project_a';
insert into public.inspections (project_id, asset_id, kind) values (:'project_a', :'a5', 'wind_blade') returning id as i5 \gset
select is((select coalesce(pilot_name, 'N') || '|' || coalesce(assistant_name, 'N') || '|' || drone_model from public.inspections where id = :'i5'),
  'N|N|Mavic 3', 'defaults parciales: nulos y espacios no se copian');

-- Límites de longitud
select throws_ok(format('update public.projects set default_drone_model = %L where id = %L', repeat('x', 121), :'project_a'),
  '23514', null, 'el modelo de dron no pasa de 120 caracteres');
select throws_ok(format('update public.projects set default_pilot_name = %L where id = %L', repeat('x', 501), :'project_a'),
  '23514', null, 'el piloto no pasa de 500 caracteres');

-- Un gerente de cliente no puede cambiar los defaults (RLS de projects)
select tests.login_as(:'mgr_a');
select is(tests.affected(format('update public.projects set default_drone_model = ''X'' where id = %L', :'project_a')), 0::bigint,
  'un gerente de cliente no edita los defaults');
select tests.logout();

-- ===== ingest_manifest: los defaults solo aplican a filas nuevas y nunca pisan lo guardado =====
create or replace function tests.put_object(p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name) values ('inspection-media', p_name);
$$;
create or replace function tests.cap(p_id uuid, p_sha text, p_base text) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'sha256', p_sha, 'spectrum', 'rgb', 'file_name', p_id || '.jpg', 'sequence_index', 1,
    'paths', jsonb_build_object('original', p_base || '/captures/' || p_id || '/original.jpg'),
    'width_px', 5280, 'height_px', 3956,
    'blade', jsonb_build_object('position', 'A', 'face', 'LE', 'radius_center_m', 30));
$$;
create or replace function tests.manifest(p_project uuid, p_insp uuid, p_asset uuid, p_caps jsonb) returns jsonb language sql as $$
  select jsonb_build_object('manifest_version', 1, 'generated_at', '2026-11-11T10:00:00Z',
    'app', '{"name":"nexus-desktop","version":"0.1.0"}'::jsonb, 'project_id', p_project,
    'inspection', jsonb_build_object('id', p_insp, 'asset_id', p_asset, 'kind', 'wind_blade', 'pilot_name', 'Piloto manifiesto'),
    'captures', p_caps, 'mosaics', '[]'::jsonb, 'findings', '[]'::jsonb);
$$;
grant execute on all functions in schema tests to anon, authenticated;

update public.projects set default_pilot_name = 'Piloto P', default_assistant_name = 'Asistente P', default_drone_model = 'Dron P' where id = :'project_a';
insert into public.assets (organization_id, site_id, kind, name) values (:'org_a', :'site_a', 'wind_turbine', 'WTG-06') returning id as a6 \gset
select gen_random_uuid() as insp_n, gen_random_uuid() as cn \gset
-- La inspección se crea antes (como hace la app de escritorio) y recibe los defaults; luego llega el manifiesto
insert into public.inspections (id, project_id, asset_id, kind) values (:'insp_n', :'project_a', :'a6', 'wind_blade');
select :'org_a' || '/' || :'project_a' || '/' || :'insp_n' as base_n \gset
select tests.put_object(:'base_n' || '/captures/' || :'cn' || '/original.jpg');
select tests.manifest(:'project_a', :'insp_n', :'a6', jsonb_build_array(tests.cap(:'cn', repeat('9', 64), :'base_n'))) as mn \gset

select tests.login_as(:'tech_a');
select public.ingest_manifest(:'mn'::jsonb) as r1 \gset
select tests.logout();
select is((select pilot_name || '|' || assistant_name || '|' || drone_model from public.inspections where id = :'insp_n'),
  'Piloto manifiesto|Asistente P|Dron P', 'el manifiesto trae piloto: gana; asistente y dron quedan con el default copiado al crear');

-- El admin edita; luego se reenvía un manifiesto SIN piloto, asistente ni dron
update public.inspections set assistant_name = 'Editada', drone_model = 'Editado', pilot_name = 'Piloto editado' where id = :'insp_n';
select tests.login_as(:'tech_a');
select public.ingest_manifest(jsonb_set((:'mn'::jsonb #- '{inspection,pilot_name}'), '{inspection,inspected_at}', '"2026-11-12T10:00:00Z"')) as r2 \gset
select tests.logout();
select is((select pilot_name || '|' || assistant_name || '|' || drone_model from public.inspections where id = :'insp_n'),
  'Piloto editado|Editada|Editado', 'reingesta sin esos campos: no se pisa lo editado con los defaults');
select ok((select inspected_at = '2026-11-12T10:00:00Z' from public.inspections where id = :'insp_n'),
  'ingest_manifest (técnico) sigue pudiendo actualizar datos de campo de la inspección');

-- ===== Guardia: el técnico no edita datos de campo; el admin sí =====
select tests.login_as(:'tech_a');
select throws_ok(format('update public.inspections set notes = %L where id = %L', 'x', :'insp_a'), 'P0001', null, 'el técnico no edita notas');
select throws_ok(format('update public.inspections set pilot_name = %L where id = %L', 'x', :'insp_a'), 'P0001', null, 'el técnico no edita el piloto');
select is(tests.affected(format('update public.inspections set asset_lat = 10, asset_lon = 20, asset_position_source = %L where id = %L', 'gps', :'insp_a')),
  1::bigint, 'el técnico sí actualiza la posición (lo que hace la app de escritorio)');
select tests.logout();
select tests.login_as(:'admin');
select is(tests.affected(format('update public.inspections set notes = %L, drone_model = %L where id = %L', 'nota admin', 'DJI', :'insp_a')),
  1::bigint, 'el admin edita datos de campo');
select tests.logout();

select * from finish();
rollback;
