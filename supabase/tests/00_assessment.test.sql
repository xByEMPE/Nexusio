begin;
\ir helpers.psql
select plan(3);
select has_table('public', 'assessment_requests', 'existe la tabla del formulario');
select tests.login_anon();
select is_empty('select 1 from public.assessment_requests', 'anon no lee solicitudes');
select throws_ok($$insert into public.assessment_requests (industry) values ('x')$$, '42501', null, 'anon no inserta');
select * from finish();
rollback;
