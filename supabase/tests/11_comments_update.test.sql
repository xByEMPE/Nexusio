begin;
\ir helpers.psql
select plan(5);

select w ->> 'project_a' as project_a, w ->> 'inspection_a' as insp_a, w ->> 'capture_a' as cap_a,
  w ->> 'mgr_a' as mgr_a
from (select tests.make_world() as w) s \gset
select id as t_crack from public.finding_types where code = 'crack' \gset

-- Datos (como postgres): inspección aprobada, un daño confirmado con comentarios de mgr_a
update public.inspections set status = 'approved' where id = :'insp_a';
insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, status)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 3, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}', 'confirmed')
  returning id as f_conf \gset
insert into public.comments (project_id, inspection_id, finding_id, author_id, body)
  values (:'project_a', :'insp_a', :'f_conf', :'mgr_a', 'sobre el daño') returning id as c_finding \gset
insert into public.comments (project_id, inspection_id, author_id, body)
  values (:'project_a', :'insp_a', :'mgr_a', 'sobre la inspección') returning id as c_insp \gset

-- La política exige la visibilidad del daño
select ok((select qual like '%findings%' and with_check like '%findings%' from pg_policies
  where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_update'),
  'comments_update exige que el daño sea visible (using y with check)');

-- Daño visible: el autor edita su comentario
select tests.login_as(:'mgr_a');
select is(tests.affected(format('update public.comments set body = ''editado'' where id = %L', :'c_finding')),
  1::bigint, 'mgr_a edita su comentario de un daño visible');
select tests.logout();

-- El daño se descarta: deja de ser visible para el cliente
update public.findings set status = 'dismissed' where id = :'f_conf';
select tests.login_as(:'mgr_a');
select is(tests.affected(format('update public.comments set body = ''otra vez'' where id = %L', :'c_finding')),
  0::bigint, 'mgr_a no edita su comentario de un daño descartado');
select is(tests.affected(format('update public.comments set body = ''inspección'' where id = %L', :'c_insp')),
  1::bigint, 'mgr_a sigue editando su comentario de la inspección');
select tests.logout();
select is((select body from public.comments where id = :'c_finding'), 'editado', 'el comentario del daño no cambió');

-- (finding_id no cambia en un update: lo impide el guardia immutable_parent.)

select * from finish();
rollback;
