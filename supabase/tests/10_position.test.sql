begin;
\ir helpers.psql
select plan(9);

select w ->> 'inspection_a' as insp_a, w ->> 'tech_a' as tech_a, w ->> 'mgr_a' as mgr_a
from (select tests.make_world() as w) s \gset

-- El técnico escribe la posición de su inspección
select tests.login_as(:'tech_a');
select is(tests.affected(format('update public.inspections set asset_lat = 10, asset_lon = -80, asset_position_source = ''lrf_target'' where id = %L', :'insp_a')),
  1::bigint, 'tech_a escribe la posición');
select is((select asset_position_source from public.inspections where id = :'insp_a'), 'lrf_target', 'queda guardada');
select tests.logout();

-- El cliente no (RLS filtra: 0 filas)
select tests.login_as(:'mgr_a');
select is(tests.affected(format('update public.inspections set asset_lat = 1, asset_lon = 1, asset_position_source = ''gps'' where id = %L', :'insp_a')),
  0::bigint, 'mgr_a no escribe la posición');
select tests.logout();

-- Rangos y todo-o-nada
select tests.login_as(:'tech_a');
select throws_ok(format('update public.inspections set asset_lat = 91, asset_lon = 0, asset_position_source = ''gps'' where id = %L', :'insp_a'),
  '23514', null, 'latitud fuera de rango');
select throws_ok(format('update public.inspections set asset_lat = 0, asset_lon = 181, asset_position_source = ''gps'' where id = %L', :'insp_a'),
  '23514', null, 'longitud fuera de rango');
select throws_ok(format('update public.inspections set asset_position_source = ''manual'' where id = %L', :'insp_a'),
  '23514', null, 'fuente no válida');
select throws_ok(format('update public.inspections set asset_lon = null where id = %L', :'insp_a'),
  '23514', null, 'las tres columnas van juntas (falta la longitud)');
select is(tests.affected(format('update public.inspections set asset_lat = null, asset_lon = null, asset_position_source = null where id = %L', :'insp_a')),
  1::bigint, 'se pueden limpiar las tres a la vez');
select throws_ok(format('update public.inspections set asset_lat = 5 where id = %L', :'insp_a'),
  '23514', null, 'solo la latitud no es válido');
select tests.logout();

select * from finish();
rollback;
