begin;
\ir helpers.psql
select plan(12);

select tests.create_user('admin@t.test') as admin \gset
select tests.create_user('tech@t.test') as tech \gset
select tests.create_user('mgr_a@t.test') as mgr_a \gset
select tests.create_user('mgr_b@t.test') as mgr_b \gset
insert into public.organizations (name, slug) values ('Org A', 'org-a') returning id as org_a \gset
insert into public.organizations (name, slug) values ('Org B', 'org-b') returning id as org_b \gset
select tests.set_role(:'admin', 'admin');
select tests.set_role(:'tech', 'technician');
select tests.add_member(:'org_a', :'mgr_a', 'client_manager');
select tests.add_member(:'org_b', :'mgr_b', 'client_manager');

select is((select platform_role::text from public.profiles where id = :'mgr_a'), null, 'perfil nuevo sin rol');
select is((select email from public.profiles where id = :'tech'), 'tech@t.test', 'handle_new_user copia el correo');
select throws_ok(format('select tests.add_member(%L, %L, ''client_viewer'')', :'org_a', :'tech'), 'P0001', null,
  'personal de NEXUS no puede ser miembro de cliente');
select throws_ok(format('select tests.set_role(%L, ''technician'')', :'mgr_a'), 'P0001', null,
  'miembro de cliente no puede recibir rol de personal');

select tests.login_as(:'mgr_a');
select results_eq('select id from public.organizations', format('values (%L::uuid)', :'org_a'), 'cliente A solo ve su organización');
select is_empty(format('select 1 from public.organization_members where organization_id = %L', :'org_b'), 'A no ve miembros de B');
select throws_ok('insert into public.organizations (name, slug) values (''X'', ''x'')', '42501', null, 'cliente no crea organizaciones');
select throws_ok(format('update public.profiles set platform_role = ''admin'' where id = %L', :'mgr_a'), null, null, 'cliente no se asigna rol');
select tests.logout();

update public.profiles set is_active = false where id = :'mgr_a';
select tests.login_as(:'mgr_a');
select is_empty('select 1 from public.organizations', 'perfil desactivado pierde acceso al instante');
select tests.logout();
update public.profiles set is_active = true where id = :'mgr_a';
delete from public.organization_members where user_id = :'mgr_a';
select tests.login_as(:'mgr_a');
select is_empty('select 1 from public.organizations', 'baja de la organización quita el acceso');
select tests.login_as(:'admin');
select ok((select count(*) from public.organizations) = 2, 'admin ve todas');
select tests.logout();
select tests.login_as(:'tech');
select is((select count(*) from public.profiles), 4::bigint, 'personal ve todos los perfiles');

select * from finish();
rollback;
