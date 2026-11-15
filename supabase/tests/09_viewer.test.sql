begin;
\ir helpers.psql
select plan(43);

select w ->> 'project_a' as project_a, w ->> 'inspection_a' as insp_a, w ->> 'asset_a' as asset_a,
  w ->> 'capture_a' as cap_a, w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'service_a' as service_a,
  w ->> 'mgr_a' as mgr_a, w ->> 'viewer_a' as viewer_a, w ->> 'mgr_b' as mgr_b
from (select tests.make_world() as w) s \gset
select id as t_crack from public.finding_types where code = 'crack' \gset

-- Datos (como postgres): inspección en revisión con un daño confirmado y otro detectado
update public.inspections set status = 'in_review' where id = :'insp_a';
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, status)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}', 'confirmed')
  returning id as f_conf \gset
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, status)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 2, '{"type":"box","points":[[0.3,0.3],[0.4,0.4]]}', 'detected')
  returning id as f_det \gset
insert into public.comments (project_id, inspection_id, finding_id, author_id, body)
  values (:'project_a', :'insp_a', :'f_det', :'tech_a', 'sobre el detectado');
insert into public.comments (project_id, inspection_id, finding_id, author_id, body)
  values (:'project_a', :'insp_a', :'f_conf', :'tech_a', 'sobre el confirmado');
insert into public.comments (project_id, inspection_id, author_id, body)
  values (:'project_a', :'insp_a', :'tech_a', 'sobre la inspección');

-- 1. En revisión el cliente no ve daños
select tests.login_as(:'mgr_a');
select is((select count(*) from public.findings), 0::bigint, 'en revisión: mgr_a no ve daños');
select is((select count(*) from public.comments where finding_id is not null), 0::bigint,
  'en revisión: mgr_a no ve comentarios de daños');
select is((select count(*) from public.comments where finding_id is null), 1::bigint,
  'en revisión: mgr_a ve los comentarios de la inspección');
select throws_ok(format('insert into public.comments (project_id, inspection_id, finding_id, body) values (%L, %L, %L, ''x'')',
  :'project_a', :'insp_a', :'f_conf'), '42501', null, 'en revisión: mgr_a no comenta el confirmado');
select throws_ok(format('select public.mark_finding_reviewed(%L)', :'f_conf'), 'P0001', 'not_allowed',
  'en revisión: mgr_a no marca revisado el confirmado');
select tests.logout();
select tests.login_as(:'viewer_a');
select is((select count(*) from public.findings), 0::bigint, 'en revisión: viewer_a no ve daños');
select tests.logout();

-- 2. El personal ve todos los daños de sus proyectos
select tests.login_as(:'tech_a');
select is((select count(*) from public.findings), 2::bigint, 'en revisión: tech_a ve los dos daños');
select tests.logout();

-- 3. Columnas de sistema (tech_a, inspección sin bloquear)
select tests.login_as(:'tech_a');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, corrected_at) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', now())',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'insert con corrected_at');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, corrected_by) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', %L)',
  :'project_a', :'insp_a', :'cap_a', :'t_crack', :'tech_a'), 'P0001', 'system_column', 'insert con corrected_by');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, source) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', ''ai'')',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'insert con source = ai');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, ai_confidence) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', 0.5)',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'insert con ai_confidence');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, ai_model) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', ''m'')',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'insert con ai_model');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, ai_model_version) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', ''1'')',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'insert con ai_model_version');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, ai_original) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', ''{}'')',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'insert con ai_original');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, client_reviewed_at) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', now())',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'insert con client_reviewed_at');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, client_reviewed_by) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', %L)',
  :'project_a', :'insp_a', :'cap_a', :'t_crack', :'mgr_a'), 'P0001', 'system_column', 'insert con client_reviewed_by');
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, created_by)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 2, '{"type":"box","points":[[0,0],[1,1]]}', :'mgr_a')
  returning id as f_man, created_by as f_man_by \gset
select is(:'f_man_by'::uuid, :'tech_a'::uuid, 'created_by ajeno se fuerza a auth.uid()');
select throws_ok(format('update public.findings set ai_original = ''{}'' where id = %L', :'f_det'), 'P0001', null, 'update de ai_original');
select throws_ok(format('update public.findings set client_reviewed_at = now() where id = %L', :'f_det'), 'P0001', 'system_column', 'update de client_reviewed_at');
select throws_ok(format('update public.findings set client_reviewed_by = %L where id = %L', :'tech_a', :'f_det'), 'P0001', 'system_column', 'update de client_reviewed_by');
select throws_ok(format('update public.findings set corrected_at = now() where id = %L', :'f_det'), 'P0001', 'system_column', 'update de corrected_at');
select throws_ok(format('update public.findings set source = ''ai'' where id = %L', :'f_det'), 'P0001', 'system_column', 'update de source');
select throws_ok(format('update public.findings set ai_confidence = 0.9 where id = %L', :'f_det'), 'P0001', 'system_column', 'update de ai_confidence');
select throws_ok(format('update public.findings set created_by = %L where id = %L', :'mgr_a', :'f_det'), 'P0001', 'system_column', 'update de created_by');
select lives_ok(format('update public.findings set severity = 4 where id = %L', :'f_det'), 'tech_a cambia la severidad');
select ok((select corrected_at is not null and corrected_by = :'tech_a'::uuid from public.findings where id = :'f_det'),
  'el trigger de corrección sigue llenando corrected_*');
select lives_ok(format('update public.findings set severity = 3 where id = %L', :'f_det'), 'una segunda corrección no choca con corrected_*');
select tests.logout();

-- el admin tampoco escribe columnas de sistema
select tests.login_as(:'admin');
select throws_ok(format('insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, source) values (%L, %L, %L, %L, 2, ''{"type":"box","points":[[0,0],[1,1]]}'', ''ai'')',
  :'project_a', :'insp_a', :'cap_a', :'t_crack'), 'P0001', 'system_column', 'admin: insert con source = ai');
select tests.logout();

-- 4. ingest_manifest (service_a, solo daños) sigue insertando daños de IA
select gen_random_uuid() as f_ai \gset
select tests.login_as(:'service_a');
select lives_ok(format('select public.ingest_manifest(%L::jsonb)', jsonb_build_object(
  'manifest_version', 1, 'generated_at', '2026-11-15T10:00:00Z',
  'app', '{"name":"nexus-desktop","version":"0.1.0"}'::jsonb,
  'project_id', :'project_a',
  'inspection', jsonb_build_object('id', :'insp_a', 'asset_id', :'asset_a', 'kind', 'wind_blade'),
  'captures', '[]'::jsonb, 'mosaics', '[]'::jsonb,
  'findings', jsonb_build_array(jsonb_build_object(
    'id', :'f_ai', 'capture_id', :'cap_a', 'type_code', 'crack', 'severity', 3,
    'region', '{"type":"box","points":[[0.5,0.5],[0.6,0.6]]}'::jsonb, 'source', 'ai',
    'ai', '{"confidence":0.8,"model":"blade-damage","version":"1.0.0"}'::jsonb)))), 'service_a ingiere un daño de IA');
select tests.logout();
select ok((select source = 'ai' and ai_original is not null and ai_confidence = 0.8 and corrected_at is null
  and created_by = :'service_a'::uuid from public.findings where id = :'f_ai'), 'daño de IA guardado con sus columnas de sistema');

-- 5. Aprobada: el cliente ve solo los confirmados
update public.inspections set status = 'approved' where id = :'insp_a';
select tests.login_as(:'mgr_a');
select is((select array_agg(id) from public.findings), array[:'f_conf'::uuid], 'aprobada: mgr_a ve solo el confirmado');
select is((select count(*) from public.comments where finding_id = :'f_det'), 0::bigint, 'mgr_a no ve comentarios del detectado');
select is((select count(*) from public.comments where finding_id = :'f_conf'), 1::bigint, 'mgr_a ve comentarios del confirmado');
select throws_ok(format('insert into public.comments (project_id, inspection_id, finding_id, body) values (%L, %L, %L, ''x'')',
  :'project_a', :'insp_a', :'f_det'), '42501', null, 'mgr_a no comenta el detectado');
select throws_ok(format('select public.mark_finding_reviewed(%L)', :'f_det'), 'P0001', 'not_allowed', 'mgr_a no marca revisado el detectado');
select lives_ok(format('insert into public.comments (project_id, inspection_id, finding_id, body) values (%L, %L, %L, ''visto'')',
  :'project_a', :'insp_a', :'f_conf'), 'mgr_a comenta el confirmado');
select lives_ok(format('select public.mark_finding_reviewed(%L)', :'f_conf'), 'mgr_a marca revisado el confirmado');
select is(current_setting('nexus.review', true), '', 'nexus.review se restablece tras marcar');
select tests.logout();
select ok((select client_reviewed_at is not null and client_reviewed_by = :'mgr_a'::uuid and corrected_at is null
  from public.findings where id = :'f_conf'), 'client_reviewed_* llenos');
select is((select client_reviewed_at from public.findings where id = :'f_det'), null::timestamptz, 'el detectado sigue sin revisar');

select tests.login_as(:'viewer_a');
select is((select array_agg(id) from public.findings), array[:'f_conf'::uuid], 'aprobada: viewer_a ve solo el confirmado');
select tests.logout();
select tests.login_as(:'mgr_b');
select is((select count(*) from public.findings where project_id = :'project_a'), 0::bigint, 'mgr_b no ve daños de A');
select tests.logout();
select tests.login_as(:'tech_a');
select is((select count(*) from public.findings where id in (:'f_conf', :'f_det')), 2::bigint, 'aprobada: tech_a ve los dos daños');
select tests.logout();

select * from finish();
rollback;
