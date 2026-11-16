begin;
\ir helpers.psql
select plan(22);

select w ->> 'project_a' as project_a, w ->> 'inspection_a' as insp_a, w ->> 'capture_a' as cap_a,
  w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'mgr_a' as mgr_a, w ->> 'tech_b' as tech_b
from (select tests.make_world() as w) s \gset

select id as t_crack from public.finding_types where code = 'crack' \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}') returning id as f_a \gset

-- insert registrado (como postgres, actor nulo)
select ok((select count(*) = 1 and bool_and(actor_id is null and old is null and new ->> 'severity' = '3' and project_id = :'project_a'::uuid and row_id = :'f_a'::uuid)
  from public.change_log where table_name = 'findings' and action = 'insert'), 'insert de daño registrado');
select ok((select count(*) = 1 from public.change_log where table_name = 'inspections' and action = 'insert' and project_id = :'project_a'::uuid), 'insert de inspección registrado');
select ok((select count(*) = 1 and bool_and(row_id = :'cap_a'::uuid) from public.change_log where table_name = 'blade_captures' and action = 'insert' and project_id = :'project_a'::uuid), 'blade_captures usa capture_id como row_id');

-- tech_a corrige la severidad
select tests.login_as(:'tech_a');
update public.findings set severity = 4 where id = :'f_a';
select tests.logout();
select ok((select count(*) = 1 from public.change_log where table_name = 'findings' and action = 'update' and row_id = :'f_a'::uuid), 'una fila de update por la corrección');
select ok((select actor_id = :'tech_a'::uuid and old ->> 'severity' = '3' and new ->> 'severity' = '4' from public.change_log where table_name = 'findings' and action = 'update' and row_id = :'f_a'::uuid), 'actor, old y new con la severidad');
select ok((select not (new ? 'region') and not (old ? 'region') and not (new ? 'updated_at') from public.change_log where table_name = 'findings' and action = 'update' and row_id = :'f_a'::uuid and new ? 'severity'), 'solo columnas cambiadas (sin updated_at ni region)');

-- captures: file_name no registra; gsd_mm_px sí
update public.captures set file_name = 'otro.jpg' where id = :'cap_a';
select is((select count(*) from public.change_log where table_name = 'captures' and action = 'update'), 0::bigint, 'cambiar file_name no genera fila');
update public.captures set gsd_mm_px = 1.5 where id = :'cap_a';
select ok((select count(*) = 1 and bool_and(new ->> 'gsd_mm_px' = '1.5' and old ->> 'gsd_mm_px' is null and not (new ? 'file_name')) from public.change_log where table_name = 'captures' and action = 'update'), 'cambiar gsd_mm_px sí genera fila');

-- blade_captures, inspections
update public.blade_captures set radius_center_m = 12 where capture_id = :'cap_a';
select is((select count(*) from public.change_log where table_name = 'blade_captures' and action = 'update'), 1::bigint, 'blade_captures: radius_center_m registrado');
update public.blade_captures set blade = 'B' where capture_id = :'cap_a';
select is((select count(*) from public.change_log where table_name = 'blade_captures' and action = 'update'), 1::bigint, 'blade_captures: columna no vigilada ignorada');
update public.inspections set status = 'captured' where id = :'insp_a';
select ok((select count(*) = 1 from public.change_log where table_name = 'inspections' and action = 'update' and new ->> 'status' = 'captured'), 'inspections: status registrado');
update public.inspections set notes = 'x' where id = :'insp_a';
select is((select count(*) from public.change_log where table_name = 'inspections' and action = 'update' and row_id = :'insp_a'::uuid), 1::bigint, 'inspections: columna no vigilada ignorada');

-- delete usa OLD
delete from public.findings where id = :'f_a';
select ok((select count(*) = 1 and bool_and(new is null and old ->> 'severity' = '4' and project_id = :'project_a'::uuid and row_id = :'f_a'::uuid) from public.change_log where table_name = 'findings' and action = 'delete'), 'delete registra OLD');

-- inmutabilidad
select throws_ok('update public.change_log set action = ''insert''', 'P0001', 'change_log_immutable', 'postgres no actualiza change_log');
select throws_ok('delete from public.change_log', 'P0001', 'change_log_immutable', 'postgres no borra change_log');
select tests.login_as(:'admin');
select throws_ok('update public.change_log set action = ''insert''', '42501', null, 'admin no actualiza change_log');
select throws_ok('delete from public.change_log', '42501', null, 'admin no borra change_log');
select throws_ok('insert into public.change_log (project_id, table_name, row_id, action) values (gen_random_uuid(), ''x'', gen_random_uuid(), ''insert'')', '42501', null, 'admin no inserta en change_log');
select ok((select count(*) > 0 from public.change_log), 'admin lee el historial');
select tests.login_as(:'tech_a');
select ok((select count(*) > 0 from public.change_log), 'tech_a asignado lee el historial');
select tests.login_as(:'tech_b');
select is((select count(*) from public.change_log where project_id = :'project_a'), 0::bigint, 'tech_b no lee historial de A');
select tests.login_as(:'mgr_a');
select is((select count(*) from public.change_log), 0::bigint, 'mgr_a (cliente) no lee el historial');

select * from finish();
rollback;
