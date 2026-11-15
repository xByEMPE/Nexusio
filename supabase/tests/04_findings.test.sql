begin;
\ir helpers.psql
select plan(44);

select w ->> 'project_a' as project_a, w ->> 'project_b' as project_b,
  w ->> 'inspection_a' as insp_a, w ->> 'inspection_b' as insp_b,
  w ->> 'capture_a' as cap_a, w ->> 'capture_b' as cap_b,
  w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'mgr_a' as mgr_a, w ->> 'viewer_a' as viewer_a,
  w ->> 'service_a' as service_a, w ->> 'mgr_b' as mgr_b, w ->> 'tech_b' as tech_b
from (select tests.make_world() as w) s \gset

select ok((select count(*) = 7 from public.finding_types where domain = 'wind_blade'), 'semilla de 7 tipos de daño de pala');
select id as t_crack from public.finding_types where code = 'crack' \gset

-- Datos (como postgres)
insert into public.assets (organization_id, site_id, kind, name)
  select organization_id, site_id, kind, 'WTG-02' from public.assets where id = (select asset_id from public.inspections where id = :'insp_a') returning id as asset_2 \gset
insert into public.inspections (project_id, asset_id, kind) values (:'project_a', :'asset_2', 'wind_blade') returning id as insp_2 \gset
insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px)
  values (:'project_a', :'insp_a', 'blade_strip', 'rgb', 'A', 'LE', 'm/a.webp', 1000, 100) returning id as mos_a \gset
insert into public.captures (project_id, inspection_id, spectrum, sha256, file_name, original_path, width_px, height_px)
  values (:'project_a', :'insp_2', 'rgb', repeat('9', 64), 'q.jpg', 'o/q.jpg', 10, 10) returning id as cap_wrong \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, ai_original)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}', '{"sev":3}') returning id as f_a \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region)
  values (:'project_b', :'insp_b', :'cap_b', :'t_crack', 2, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}') returning id as f_b \gset

-- checks
select throws_ok(format('insert into public.findings (project_id, inspection_id, type_id, severity, region) values (%L, %L, %L, 3, ''{"type":"box","points":[]}'')', :'project_a', :'insp_a', :'t_crack'), '23514', null, 'ni captura ni mosaico');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, mosaic_id, type_id, severity, region) values (%L, %L, %L, %L, %L, 3, ''{"type":"box","points":[]}'')', :'project_a', :'insp_a', :'cap_a', :'mos_a', :'t_crack'), '23514', null, 'captura y mosaico a la vez');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region) values (%L, %L, %L, %L, 6, ''{"type":"box","points":[]}'')', :'project_a', :'insp_a', :'cap_a', :'t_crack'), '23514', null, 'severity <= 5');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region) values (%L, %L, %L, %L, 0, ''{"type":"box","points":[]}'')', :'project_a', :'insp_a', :'cap_a', :'t_crack'), '23514', null, 'severity >= 1');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, ai_confidence) values (%L, %L, %L, %L, 3, ''{"type":"box","points":[]}'', 1.5)', :'project_a', :'insp_a', :'cap_a', :'t_crack'), '23514', null, 'ai_confidence <= 1');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region) values (%L, %L, %L, %L, 3, ''{"type":"circle","points":[]}'')', :'project_a', :'insp_a', :'cap_a', :'t_crack'), '23514', null, 'region.type inválido');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region) values (%L, %L, %L, %L, 3, ''{"type":"box"}'')', :'project_a', :'insp_a', :'cap_a', :'t_crack'), '23514', null, 'region sin points');

-- tech_a
select tests.login_as(:'tech_a');
select lives_ok(format('insert into public.findings (project_id, inspection_id, mosaic_id, type_id, severity, region, source) values (%L, %L, %L, %L, 2, ''{"type":"polygon","points":[[0,0],[1,0],[1,1]]}'', ''manual'')', :'project_a', :'insp_a', :'mos_a', :'t_crack'), 'tech_a inserta daño en mosaico');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region) values (%L, %L, %L, %L, 3, ''{"type":"box","points":[]}'')', :'project_b', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'project_mismatch', 'project_id distinto al de la inspección');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region) values (%L, %L, %L, %L, 3, ''{"type":"box","points":[]}'')', :'project_a', :'insp_a', :'cap_wrong', :'t_crack'), 'P0001', null, 'captura de otra inspección');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region) values (%L, %L, %L, %L, 3, ''{"type":"box","points":[]}'')', :'project_b', :'insp_b', :'cap_b', :'t_crack'), '42501', null, 'tech_a no inserta en B');
select is((select count(*) from public.findings where id = :'f_b'), 0::bigint, 'tech_a no ve daños de B');
select ok((select corrected_at is null from public.findings where id = :'f_a'), 'sin corrección al inicio');
select lives_ok(format('update public.findings set severity = 4 where id = %L', :'f_a'), 'tech_a cambia la severidad');
select ok((select corrected_at is not null and corrected_by = :'tech_a'::uuid and severity = 4 and ai_original = '{"sev":3}'::jsonb from public.findings where id = :'f_a'), 'corrected_at/by llenos y ai_original intacto');
select throws_ok(format('update public.findings set ai_original = ''{}'' where id = %L', :'f_a'), 'P0001', 'ai_original_immutable', 'ai_original inmutable');
select throws_ok(format('update public.findings set inspection_id = %L, project_id = %L where id = %L', :'insp_b', :'project_b', :'f_a'), 'P0001', null, 'padres inmutables');
select is(tests.affected(format('delete from public.findings where id = %L', :'f_a')), 0::bigint, 'tech_a no borra daños');
select lives_ok(format('insert into public.comments (project_id, inspection_id, finding_id, body) values (%L, %L, %L, ''hola'')', :'project_a', :'insp_a', :'f_a'), 'tech_a comenta un daño');
select throws_ok(format('insert into public.comments (project_id, inspection_id, finding_id, body) values (%L, %L, %L, ''x'')', :'project_a', :'insp_a', :'f_b'), 'P0001', null, 'comentario sobre daño de otro proyecto');
select tests.logout();

-- el comentario de un daño debe ser de la misma inspección
select throws_ok(format('insert into public.comments (project_id, inspection_id, finding_id, author_id, body) values (%L, %L, %L, %L, ''x'')', :'project_a', :'insp_2', :'f_a', :'tech_a'), 'P0001', 'inspection_mismatch', 'daño de otra inspección del mismo proyecto');

-- author_name
select ok((select author_name = 'tech_a@w.test' and author_id = :'tech_a'::uuid from public.comments), 'author_name se llena solo (email)');
update public.profiles set full_name = 'Ana Pérez' where id = :'mgr_a';

-- ingest: no cuenta como corrección
select set_config('nexus.ingest', 'on', true);
update public.findings set corrected_at = null, corrected_by = null where id = :'f_a';
update public.findings set severity = 5 where id = :'f_a';
select ok((select corrected_at is null from public.findings where id = :'f_a'), 'con nexus.ingest = on no se llena corrected_at');
select set_config('nexus.ingest', '', true);

-- mgr_a (cliente)
select tests.login_as(:'mgr_a');
select is(tests.affected(format('update public.findings set severity = 1 where id = %L', :'f_a')), 0::bigint, 'mgr_a no actualiza daños');
select is((select severity from public.findings where id = :'f_a'), 5::smallint, 'la severidad sigue igual');
select lives_ok(format('select public.mark_finding_reviewed(%L)', :'f_a'), 'mgr_a marca revisado');
select ok((select client_reviewed_at is not null and client_reviewed_by = :'mgr_a'::uuid and corrected_at is null from public.findings where id = :'f_a'), 'client_reviewed_at lleno sin tocar corrected_at');
select throws_ok(format('select public.mark_finding_reviewed(%L)', :'f_b'), 'P0001', null, 'mgr_a no marca daños de B');
select lives_ok(format('insert into public.comments (project_id, inspection_id, body) values (%L, %L, ''ok'')', :'project_a', :'insp_a'), 'mgr_a comenta');
select ok((select author_name = 'Ana Pérez' from public.comments where author_id = :'mgr_a'), 'author_name usa full_name');
select throws_ok(format('insert into public.comments (project_id, inspection_id, author_id, body) values (%L, %L, %L, ''suplantado'')', :'project_a', :'insp_a', :'tech_a'), '42501', null, 'no se comenta como otro autor');
select is(tests.affected(format('update public.comments set body = ''editado'' where author_id = %L', :'tech_a')), 0::bigint, 'mgr_a no edita comentarios ajenos');
select lives_ok(format('update public.comments set body = ''editado'' where author_id = %L', :'mgr_a'), 'el autor edita su comentario');
select ok((select edited_at is not null from public.comments where author_id = :'mgr_a'), 'edited_at fijado');
select tests.logout();

-- viewer_a
select tests.login_as(:'viewer_a');
select is((select count(*) from public.findings), 2::bigint, 'viewer_a lee daños de A');
select throws_ok(format('insert into public.comments (project_id, inspection_id, body) values (%L, %L, ''no'')', :'project_a', :'insp_a'), '42501', null, 'viewer_a no comenta');
select throws_ok(format('select public.mark_finding_reviewed(%L)', :'f_a'), 'P0001', null, 'viewer_a no marca revisado');
select tests.logout();

-- mgr_b aislado
select tests.login_as(:'mgr_b');
select ok((select count(*) = 1 from public.findings) and (select count(*) = 0 from public.comments), 'mgr_b no ve daños ni comentarios de A');
select tests.logout();

-- admin borra; tipos solo admin
select tests.login_as(:'tech_a');
select throws_ok('insert into public.finding_types (domain, code, label_es, label_en) values (''solar'', ''x'', ''x'', ''x'')', '42501', null, 'tech_a no edita el catálogo de tipos');
select tests.logout();
select tests.login_as(:'admin');
select is(tests.affected(format('delete from public.findings where id = %L', :'f_b')), 1::bigint, 'admin borra daños');
select tests.logout();

-- Bloqueo por aprobación (§6.6)
update public.inspections set status = 'approved' where id = :'insp_a';
select tests.login_as(:'tech_a');
select is(tests.affected(format('update public.findings set severity = 2 where id = %L', :'f_a')), 0::bigint, 'aprobada: tech_a no edita daños');
select lives_ok(format('insert into public.comments (project_id, inspection_id, body) values (%L, %L, ''tras aprobar'')', :'project_a', :'insp_a'), 'aprobada: tech_a comenta');
select tests.logout();
select tests.login_as(:'mgr_a');
select lives_ok(format('insert into public.comments (project_id, inspection_id, finding_id, body) values (%L, %L, %L, ''tras aprobar'')', :'project_a', :'insp_a', :'f_a'), 'aprobada: mgr_a comenta');
select tests.logout();

select * from finish();
rollback;
