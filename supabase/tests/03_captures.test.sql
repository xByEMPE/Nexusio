begin;
\ir helpers.psql
select plan(45);

select w ->> 'project_a' as project_a, w ->> 'project_b' as project_b,
  w ->> 'inspection_a' as insp_a, w ->> 'inspection_b' as insp_b,
  w ->> 'capture_a' as cap_a, w ->> 'capture_b' as cap_b,
  w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'mgr_a' as mgr_a, w ->> 'viewer_a' as viewer_a,
  w ->> 'service_a' as service_a, w ->> 'mgr_b' as mgr_b, w ->> 'org_a' as org_a
from (select tests.make_world() as w) s \gset

-- Datos extra (como postgres): otra captura en A y otra inspección del mismo proyecto
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px)
  values (:'project_a', :'insp_a', 'thermal', repeat('2', 64), 'x.jpg', 'o/x.jpg', 10, 10) returning id as cap_x \gset
insert into public.assets (organization_id, site_id, kind, name)
  select organization_id, site_id, kind, 'WTG-02' from public.assets where id = (select asset_id from public.inspections where id = :'insp_a') returning id as asset_2 \gset
insert into public.inspections (project_id, asset_id, kind) values (:'project_a', :'asset_2', 'wind_blade') returning id as insp_2 \gset
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px)
  values (:'project_a', :'insp_2', 'rgb', repeat('3', 64), 'y.jpg', 'o/y.jpg', 10, 10) returning id as cap_y \gset

-- Lectura (prueba 1 de §10.1)
select tests.login_as(:'mgr_a');
select ok((select count(*) = 3 and bool_and(project_id = :'project_a'::uuid) and bool_or(id = :'cap_a'::uuid) from public.captures), 'mgr_a lee capturas de A y no capture_b');
select is((select count(*) from public.blade_captures), 1::bigint, 'mgr_a lee solo blade_captures de A');
select is(tests.affected(format('update public.captures set file_name = ''z'' where id = %L', :'cap_a')), 0::bigint, 'mgr_a no escribe capturas');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', %L, ''m.jpg'', ''o/m.jpg'', 10, 10)', :'project_a', :'insp_a', repeat('c', 64)), '42501', null, 'mgr_a no inserta capturas');
select tests.logout();

select tests.login_as(:'viewer_a');
select is((select count(*) from public.captures), 3::bigint, 'viewer_a lee capturas de A');
select tests.logout();

-- Técnico asignado
select tests.login_as(:'tech_a');
select is((select count(*) from public.captures where project_id = :'project_a'), (select count(*) from public.captures), 'tech_a ve solo capturas de A');
select lives_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px, gsd_mm_px) values (%L, %L, ''rgb'', %L, ''n.jpg'', ''o/n.jpg'', 100, 100, 0.5)', :'project_a', :'insp_a', repeat('d', 64)), 'tech_a inserta captura en A');
-- prueba 5: project_id incoherente con la inspección
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', %L, ''x.jpg'', ''o/x.jpg'', 10, 10)', :'project_a', :'insp_b', repeat('e', 64)), 'P0001', 'project_mismatch', 'project_id distinto al de la inspección');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', %L, ''x.jpg'', ''o/x.jpg'', 10, 10)', :'project_b', :'insp_b', repeat('e', 64)), '42501', null, 'tech_a no inserta en B');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', %L, ''d2.jpg'', ''o/d2.jpg'', 10, 10)', :'project_a', :'insp_a', repeat('d', 64)), '23505', null, 'sha256 duplicado en la misma inspección');
select throws_ok(format('insert into public.blade_captures (capture_id, project_id, blade, face) select id, %L, ''B'', ''PS'' from public.captures where sha256 = %L', :'project_b', repeat('d', 64)), 'P0001', 'project_mismatch', 'blade_captures con project_id distinto al de su captura');
select lives_ok(format('insert into public.blade_captures (capture_id, project_id, blade, face) select id, %L, ''B'', ''PS'' from public.captures where sha256 = %L', :'project_a', repeat('d', 64)), 'blade_captures coherente');
select throws_ok(format('update public.blade_captures set face = ''XX'' where capture_id = %L', :'cap_a'), '22P02', null, 'face = XX es error de tipo');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', %L, ''w.jpg'', ''o/w.jpg'', 0, 10)', :'project_a', :'insp_a', repeat('f', 64)), '23514', null, 'width_px > 0');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', ''XYZ'', ''w.jpg'', ''o/w.jpg'', 10, 10)', :'project_a', :'insp_a'), '23514', null, 'sha256 con formato válido');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px, gsd_mm_px) values (%L, %L, ''rgb'', %L, ''w.jpg'', ''o/w.jpg'', 10, 10, 0)', :'project_a', :'insp_a', repeat('f', 64)), '23514', null, 'gsd_mm_px > 0');
select lives_ok(format('insert into public.thermal_captures (capture_id, project_id) select id, %L from public.captures where sha256 = %L', :'project_a', repeat('d', 64)), 'thermal_captures con valores por defecto');
select ok((select temp_scale = 0.01 and temp_offset = -100 from public.thermal_captures), 'temp_scale 0.01 y temp_offset -100 por defecto');
select throws_ok(format('insert into public.thermal_captures (capture_id, project_id) values (%L, %L)', :'cap_b', :'project_a'), 'P0001', 'project_mismatch', 'tech_a no cuelga térmicas de una captura ajena');
select tests.logout();

-- Mosaicos e id_capture_id
select tests.login_as(:'tech_a');
select lives_ok(format('insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px) values (%L, %L, ''blade_strip'', ''rgb'', ''A'', ''LE'', ''m/a.webp'', 1000, 100)', :'project_a', :'insp_a'), 'tech_a inserta mosaico');
select throws_ok(format('insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px) values (%L, %L, ''blade_strip'', ''rgb'', ''A'', ''LE'', ''m/a2.webp'', 1000, 100)', :'project_a', :'insp_a'), '23505', null, 'mosaico único por inspección, tipo, espectro, pala y cara');
select throws_ok(format('insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px) values (%L, %L, ''blade_strip'', ''rgb'', ''B'', ''LE'', ''m/b.webp'', 1000, 100)', :'project_a', :'insp_b'), 'P0001', 'project_mismatch', 'mosaico con project_id incoherente');
select throws_ok(format('update public.inspections set id_capture_id = %L where id = %L', :'cap_b', :'insp_a'), 'P0001', null, 'id_capture_id debe ser de la misma inspección');
select lives_ok(format('update public.inspections set id_capture_id = %L where id = %L', :'cap_a', :'insp_a'), 'id_capture_id de la misma inspección');
select tests.logout();

-- Emparejado e inmutabilidad (como postgres)
select lives_ok(format('update public.captures set paired_capture_id = %L where id = %L', :'cap_a', :'cap_x'), 'emparejar dentro de la misma inspección');
select throws_ok(format('update public.captures set paired_capture_id = %L where id = %L', :'cap_y', :'cap_x'), 'P0001', null, 'emparejar con otra inspección del mismo proyecto');
select throws_ok(format('update public.captures set paired_capture_id = id where id = %L', :'cap_x'), 'P0001', null, 'una captura no se empareja consigo misma');
select throws_ok(format('update public.captures set inspection_id = %L where id = %L', :'insp_2', :'cap_x'), 'P0001', 'immutable_parent', 'captures.inspection_id inmutable');
select throws_ok(format('update public.captures set project_id = %L where id = %L', :'project_b', :'cap_x'), 'P0001', 'immutable_parent', 'captures.project_id inmutable');
select throws_ok(format('update public.blade_captures set capture_id = %L where capture_id = %L', :'cap_x', :'cap_a'), 'P0001', 'immutable_parent', 'blade_captures.capture_id inmutable');
select throws_ok(format('update public.thermal_captures set capture_id = %L', :'cap_x'), 'P0001', 'immutable_parent', 'thermal_captures.capture_id inmutable');
select throws_ok(format('update public.mosaics set inspection_id = %L', :'insp_2'), 'P0001', 'immutable_parent', 'mosaics.inspection_id inmutable');
select throws_ok(format('update public.mosaics set project_id = %L', :'project_b'), 'P0001', 'immutable_parent', 'mosaics.project_id inmutable');

-- viewer_a no escribe; mgr_b no ve mosaicos de A
select tests.login_as(:'viewer_a');
select throws_ok(format('insert into public.blade_captures (capture_id, project_id, blade, face) values (%L, %L, ''C'', ''TE'')', :'cap_x', :'project_a'), '42501', null, 'viewer_a no inserta blade_captures');
select throws_ok(format('insert into public.thermal_captures (capture_id, project_id) values (%L, %L)', :'cap_x', :'project_a'), '42501', null, 'viewer_a no inserta thermal_captures');
select throws_ok(format('insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px) values (%L, %L, ''blade_strip'', ''rgb'', ''C'', ''TE'', ''m/c.webp'', 10, 10)', :'project_a', :'insp_a'), '42501', null, 'viewer_a no inserta mosaicos');
select tests.logout();
select tests.login_as(:'mgr_b');
select is((select count(*) from public.mosaics), 0::bigint, 'mgr_b no ve mosaicos de A');
select tests.logout();

-- Inspección aprobada (prueba 10)
select tests.login_as(:'admin');
select lives_ok(format('update public.inspections set status = ''approved'' where id = %L', :'insp_a'), 'admin aprueba A');
select tests.logout();
select tests.login_as(:'tech_a');
select throws_ok(format('insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px) values (%L, %L, ''rgb'', %L, ''l.jpg'', ''o/l.jpg'', 10, 10)', :'project_a', :'insp_a', repeat('1', 64)), '42501', null, 'tech_a no inserta con A aprobada');
select is(tests.affected(format('update public.captures set file_name = ''q'' where id = %L', :'cap_a')), 0::bigint, 'tech_a no actualiza con A aprobada');
select is(tests.affected(format('delete from public.captures where id = %L', :'cap_a')), 0::bigint, 'tech_a no borra con A aprobada');
select is(tests.affected(format('update public.blade_captures set radius_center_m = 1 where capture_id = %L', :'cap_a')), 0::bigint, 'tech_a no actualiza blade_captures con A aprobada');
select is(tests.affected('update public.thermal_captures set t_min_c = 1'), 0::bigint, 'tech_a no actualiza thermal_captures con A aprobada');
select is(tests.affected('update public.mosaics set path = ''z'''), 0::bigint, 'tech_a no actualiza mosaicos con A aprobada');
select tests.logout();
select tests.login_as(:'admin');
select is(tests.affected(format('update public.captures set file_name = ''q'' where id = %L', :'cap_a')), 1::bigint, 'admin sí actualiza con A aprobada');
select tests.logout();

select * from finish();
rollback;
