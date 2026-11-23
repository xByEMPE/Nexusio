begin;
\ir helpers.psql
select plan(51);

select w ->> 'org_a' as org_a, w ->> 'org_b' as org_b, w ->> 'project_a' as project_a, w ->> 'project_b' as project_b,
  w ->> 'inspection_a' as insp_a, w ->> 'inspection_b' as insp_b, w ->> 'asset_a' as asset_a, w ->> 'site_a' as site_a,
  w ->> 'site_b' as site_b, w ->> 'asset_b' as asset_b,
  w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'tech_b' as tech_b, w ->> 'service_a' as service_a,
  w ->> 'mgr_a' as mgr_a, w ->> 'viewer_a' as viewer_a, w ->> 'mgr_b' as mgr_b
from (select tests.make_world() as w) s \gset

-- Técnico asignado
select tests.login_as(:'tech_a');
select results_eq('select id from public.projects', format('values (%L::uuid)', :'project_a'), 'tech_a ve solo el proyecto A');
select is_empty(format('select 1 from public.projects where id = %L', :'project_b'), 'tech_a no ve el proyecto B');
select is_empty(format('select 1 from public.sites where id = %L', :'site_b'), 'tech_a no lee el sitio de B');
select results_eq('select id from public.organizations', format('values (%L::uuid)', :'org_a'), 'asignado lee la organización de su proyecto, no otras');
select is((select count(*) from public.inspections), 1::bigint, 'tech_a ve solo la inspección A');
select is((select count(*) from public.wind_turbine_specs), 1::bigint, 'tech_a ve solo las specs de A');
select is((select blade_length_m from public.wind_turbine_specs), 61.2::numeric, 'specs con blade_length_m = 61.2');
select lives_ok(format('update public.inspections set status = ''captured'' where id = %L', :'insp_a'), 'tech_a actualiza el estado en A');
select is((select status::text from public.inspections where id = :'insp_a'), 'captured', 'el estado quedó guardado');
select is(tests.affected(format('update public.inspections set status = ''captured'' where id = %L', :'insp_b')), 0::bigint, 'tech_a no edita en B');
select throws_ok(format('update public.inspections set status = ''approved'' where id = %L', :'insp_a'), 'P0001', null, 'tech_a no aprueba');
select throws_ok(format('insert into public.inspections (project_id, asset_id, kind) values (%L, %L, ''solar'')', :'project_b', :'asset_b'), '42501', null, 'tech_a no crea inspecciones en B');
select throws_ok(format('insert into public.sites (organization_id, kind, name) values (%L, ''wind_farm'', ''N'')', :'org_a'), '42501', null, 'tech_a no crea sitios');
select tests.logout();

-- Gerente de cliente
select tests.login_as(:'mgr_a');
select results_eq('select id from public.projects', format('values (%L::uuid)', :'project_a'), 'mgr_a ve el proyecto A y no el B');
select is((select count(*) from public.inspections), 1::bigint, 'mgr_a ve la inspección de A');
select is((select count(*) from public.project_sites), 1::bigint, 'mgr_a ve los sitios del proyecto A');
select is((select count(*) from public.assets), 1::bigint, 'mgr_a ve los activos de A');
select tests.logout();

-- Aprobación
select tests.login_as(:'admin');
select lives_ok(format('update public.inspections set status = ''approved'' where id = %L', :'insp_a'), 'admin aprueba');
select ok((select approved_at is not null and approved_by = :'admin'::uuid from public.inspections where id = :'insp_a'), 'se llenan approved_at y approved_by');
select tests.logout();
select tests.login_as(:'tech_a');
select is(tests.affected(format('update public.inspections set notes = ''y'' where id = %L', :'insp_a')), 0::bigint, 'tech_a no edita una inspección aprobada');
select tests.logout();
select tests.login_as(:'admin');
select lives_ok(format('update public.inspections set notes = ''z'' where id = %L', :'insp_a'), 'admin edita la aprobada');
select lives_ok(format('update public.inspections set status = ''in_review'' where id = %L', :'insp_a'), 'admin desaprueba');
select ok((select approved_at is null and approved_by is null from public.inspections where id = :'insp_a'), 'se limpian los campos al desaprobar');

-- Coherencias (admin pasa RLS; fallan los triggers)
select throws_ok(format('insert into public.project_sites (project_id, site_id) values (%L, %L)', :'project_a', :'site_b'), 'P0001', null, 'sitio de otra organización en el proyecto');
select throws_ok(format('insert into public.assets (organization_id, site_id, kind, name) values (%L, %L, ''wind_turbine'', ''X'')', :'org_a', :'site_b'), 'P0001', null, 'activo con organización distinta a la de su sitio');
select throws_ok(format('update public.projects set organization_id = %L where id = %L', :'org_b', :'project_a'), 'P0001', null, 'proyecto con inspecciones no cambia de organización');
select throws_ok(format('insert into public.project_assignments (project_id, user_id) values (%L, %L)', :'project_a', :'mgr_a'), 'P0001', null, 'no se asigna a un usuario de cliente');
select throws_ok(format('insert into public.project_assignments (project_id, user_id) values (%L, %L)', :'project_a', :'admin'), 'P0001', null, 'no se asigna a un admin');
select throws_ok(format('insert into public.inspections (project_id, asset_id, kind) values (%L, %L, ''solar'')', :'project_a', :'asset_b'), 'P0001', null, 'activo de otra organización en la inspección');
select throws_ok(format('insert into public.inspections (project_id, asset_id, kind) values (%L, %L, ''wind_blade'')', :'project_a', :'asset_a'), '23505', null, 'inspección única por proyecto, activo y tipo');
select tests.logout();

-- Activo con inspecciones no cambia de organización
select throws_ok(format('update public.assets set organization_id = %L, site_id = %L where id = %L', :'org_b', :'site_b', :'asset_a'), 'P0001', null, 'activo con inspecciones no cambia de organización');
select tests.logout();

-- Escrituras adicionales del técnico y del servicio
select tests.login_as(:'tech_a');
select throws_ok(format('insert into public.inspections (project_id, asset_id, kind, status) values (%L, %L, ''solar'', ''approved'')', :'project_a', :'asset_a'), 'P0001', null, 'tech_a no crea una inspección aprobada');
select throws_ok(format('update public.inspections set project_id = %L where id = %L', :'project_b', :'insp_a'), 'P0001', null, 'tech_a no cambia el project_id de una inspección');
select is((select count(*) from public.project_assignments), 1::bigint, 'tech_a ve solo su asignación');
select tests.login_as(:'service_a');
select is(tests.affected(format('update public.inspections set status = ''captured'' where id = %L', :'insp_a')), 1::bigint, 'service_a actualiza el estado de la inspección A');
select tests.logout();

-- Visor de cliente
select tests.login_as(:'viewer_a');
select throws_ok(format('insert into public.sites (organization_id, kind, name) values (%L, ''wind_farm'', ''N'')', :'org_a'), '42501', null, 'viewer no crea sitios');
select throws_ok(format('insert into public.projects (organization_id, name) values (%L, ''N'')', :'org_a'), '42501', null, 'viewer no crea proyectos');
select throws_ok(format('insert into public.inspections (project_id, asset_id, kind) values (%L, %L, ''solar'')', :'project_a', :'asset_a'), '42501', null, 'viewer no crea inspecciones');
select is(tests.affected(format('update public.inspections set notes = ''v'' where id = %L', :'insp_a')), 0::bigint, 'viewer no edita inspecciones');
select is(tests.affected(format('update public.sites set notes = ''v'' where id = %L', :'site_a')), 0::bigint, 'viewer no edita sitios');
select ok(not private.can_comment_project(:'project_a'::uuid), 'client_viewer no comenta');
select throws_ok(format('insert into public.assets (organization_id, site_id, kind, name) values (%L, %L, ''wind_turbine'', ''N'')', :'org_a', :'site_a'), '42501', null, 'viewer no crea activos');
select throws_ok(format('insert into public.wind_turbine_specs (asset_id) values (%L)', :'asset_a'), '42501', null, 'viewer no crea specs');
select throws_ok(format('insert into public.project_sites (project_id, site_id) values (%L, %L)', :'project_a', :'site_a'), '42501', null, 'viewer no liga sitios');
select throws_ok(format('insert into public.project_assignments (project_id, user_id) values (%L, %L)', :'project_a', :'tech_b'), '42501', null, 'viewer no asigna');
select tests.logout();

-- Funciones de permiso
select tests.login_as(:'mgr_a');
select ok(private.can_comment_project(:'project_a'::uuid), 'client_manager comenta');
select tests.login_as(:'service_a');
select ok(private.can_write_project(:'project_a'::uuid) and not private.can_comment_project(:'project_a'::uuid), 'service escribe y no comenta');
select tests.logout();
update public.profiles set is_active = false where id = :'tech_a';
select tests.login_as(:'tech_a');
select is_empty('select 1 from public.projects', 'técnico desactivado pierde el acceso');
select tests.logout();
update public.profiles set is_active = true where id = :'tech_a';

-- Degradación: pierde asignaciones y acceso
select tests.set_role(:'tech_a'::uuid, null);
select is((select count(*) from public.project_assignments where user_id = :'tech_a'), 0::bigint, 'degradar borra las asignaciones');
select tests.login_as(:'tech_a');
select is((select count(*) from public.projects) + (select count(*) from public.sites) + (select count(*) from public.organizations)
  + (select count(*) from public.inspections), 0::bigint, 'ex técnico no ve nada');
select tests.logout();

-- Anónimo
select tests.login_anon();
select is((select count(*) from public.organizations) + (select count(*) from public.sites) + (select count(*) from public.assets)
  + (select count(*) from public.projects) + (select count(*) from public.inspections), 0::bigint, 'anon no lee nada del catálogo');

select * from finish();
rollback;
