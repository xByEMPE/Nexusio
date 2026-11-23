begin;
\ir helpers.psql
select plan(36);

select w ->> 'project_a' as project_a, w ->> 'org_a' as org_a, w ->> 'inspection_a' as insp_a, w ->> 'capture_a' as cap_a,
  w ->> 'admin' as admin, w ->> 'tech_a' as tech_a, w ->> 'tech_b' as tech_b, w ->> 'mgr_a' as mgr_a,
  w ->> 'asset_a' as asset_a
from (select tests.make_world() as w) s \gset

-- ---- Triggers de auditoría nuevos -------------------------------------------------------------------------------
select ok((select count(*) = 1 from public.change_log
  where table_name = 'projects' and action = 'insert' and row_id = :'project_a'::uuid and project_id = :'project_a'::uuid),
  'projects: el insert se registra con project_id = su id');
select ok((select count(*) >= 1 from public.change_log
  where table_name = 'organizations' and action = 'insert' and project_id is null and new ->> 'slug' = 'world-org-a'),
  'organizations: evento global (project_id null)');
select ok((select count(*) = 1 from public.change_log
  where table_name = 'project_assignments' and action = 'insert' and row_id = :'tech_a'::uuid and project_id = :'project_a'::uuid),
  'project_assignments: row_id = user_id y project_id de la asignación');
select ok((select count(*) = 1 from public.change_log
  where table_name = 'organization_members' and action = 'insert' and row_id = :'mgr_a'::uuid and project_id is null
    and new ->> 'organization_id' = :'org_a'),
  'organization_members: row_id = user_id, evento global con la organización');
select ok((select count(*) >= 1 from public.change_log
  where table_name = 'assets' and action = 'insert' and row_id = :'asset_a'::uuid and project_id is null and new ->> 'name' = 'WTG-01'),
  'assets: evento global con el nombre');
select ok((select count(*) = 1 from public.change_log
  where table_name = 'wind_turbine_specs' and action = 'insert' and row_id = :'asset_a'::uuid),
  'wind_turbine_specs: row_id = asset_id');
select ok((select count(*) >= 1 from public.change_log
  where table_name = 'profiles' and row_id = :'tech_a'::uuid and new ->> 'platform_role' = 'technician'),
  'profiles: el cambio de rol se registra');

select count(*) as pf_before from public.change_log where table_name = 'profiles' \gset
update public.profiles set full_name = 'Otro Nombre' where id = :'tech_a';
select is((select count(*) from public.change_log where table_name = 'profiles'), :pf_before::bigint,
  'profiles: cambiar el nombre no genera fila (el historial no guarda nombres)');

insert into public.comments (project_id, inspection_id, author_id, author_name, body)
  values (:'project_a', :'insp_a', :'tech_a', 'x', repeat('x', 500));
select ok((select count(*) = 1 and bool_and(length(new ->> 'body') = 200)
    from public.change_log where table_name = 'comments' and action = 'insert' and project_id = :'project_a'::uuid)
  and (select max(length(body)) = 500 from public.comments where project_id = :'project_a'::uuid),
  'comments: el historial trunca el cuerpo a 200 y el comentario conserva sus 500');

-- ---- RLS del registro ------------------------------------------------------------------------------------------
select tests.login_as(:'tech_a');
select is((select count(*) from public.change_log where project_id is null), 0::bigint, 'técnico no ve eventos globales');
select is((select count(*) from public.change_log where table_name = 'project_assignments'), 0::bigint,
  'técnico no ve asignaciones (gestión de usuarios)');
select is((select count(*) from public.change_log where table_name = 'projects' and action = 'insert' and row_id = :'project_a'::uuid), 1::bigint,
  'técnico asignado ve los eventos de su proyecto');
select tests.login_as(:'tech_b');
select is((select count(*) from public.change_log where project_id = :'project_a'), 0::bigint, 'técnico de otro proyecto no ve el historial de A');
select tests.login_as(:'mgr_a');
select is((select count(*) from public.change_log), 0::bigint, 'cliente no ve nada del registro');
select tests.login_as(:'admin');
select ok((select count(*) > 0 from public.change_log where project_id is null), 'admin ve los eventos globales');
select ok((select count(*) > 0 from public.change_log where table_name = 'project_assignments'), 'admin ve las asignaciones');
select tests.logout();

-- ---- Purga de usuario -------------------------------------------------------------------------------------------
select tests.create_user('admin2@w.test') as admin2 \gset
select tests.set_role(:'admin2', 'admin');
select id as t_crack from public.finding_types where code = 'crack' \gset

insert into public.findings (project_id, inspection_id, capture_id, type_id, severity, region, created_by, corrected_by, client_reviewed_by)
  values (:'project_a', :'insp_a', :'cap_a', :'t_crack', 2, '{"type":"box","points":[[0.1,0.1],[0.2,0.2]]}', :'admin2', :'admin2', :'admin2')
  returning id as f1 \gset
insert into public.comments (project_id, inspection_id, author_id, author_name, body)
  values (:'project_a', :'insp_a', :'admin2', 'x', 'comentario de admin2');
update public.projects set created_by = :'admin2' where id = :'project_a';
update public.project_assignments set assigned_by = :'admin2' where project_id = :'project_a' and user_id = :'tech_a';
insert into public.mosaics (project_id, inspection_id, kind, spectrum, blade, face, path, width_px, height_px, calibrated_by)
  values (:'project_a', :'insp_a', 'blade_strip', 'rgb', 'A', 'LE', 'x/strip.webp', 100, 100, :'admin2') returning id as mo1 \gset
-- admin2 aprueba la inspección (approved_by = admin2; el guard lo devolvía siempre a su valor anterior)
select tests.login_as(:'admin2');
update public.inspections set status = 'approved' where id = :'insp_a';
select tests.logout();

select count(*) as cl_before from public.change_log \gset

select tests.login_as(:'admin');
select public.admin_delete_user(:'admin2') ->> 'status' as st \gset
select tests.logout();

select is(:'st'::text, 'purged', 'admin_delete_user purga al usuario');
select is((select count(*) from public.comments where author_id = :'admin2'), 0::bigint, 'se borraron sus comentarios (FK RESTRICT resuelta)');
select ok((select created_by is null and corrected_by is null and client_reviewed_by is null from public.findings where id = :'f1'),
  'el daño que creó/corrigió/revisó se conserva con el autor en null');
select ok((select approved_by is null and status = 'approved' from public.inspections where id = :'insp_a'),
  'la inspección que aprobó se conserva con approved_by en null');
select ok((select created_by is null from public.projects where id = :'project_a')
  and (select assigned_by is null from public.project_assignments where project_id = :'project_a' and user_id = :'tech_a')
  and (select calibrated_by is null from public.mosaics where id = :'mo1'),
  'projects.created_by, assigned_by y calibrated_by en null');
select ok((select platform_role is null and not is_active from public.profiles where id = :'admin2'),
  'el perfil queda sin rol e inactivo hasta que Auth lo borre');
select is((select count(*) from public.change_log), :cl_before::bigint + 1,
  'la purga deja un solo evento (sin una fila por cada fila afectada)');
select ok((select count(*) = 1 and bool_and(project_id is null and new is null and actor_id = :'admin'::uuid
      and old::text !~ '@' and old ->> 'platform_role' = 'admin')
    from public.change_log where table_name = 'profiles' and action = 'delete' and row_id = :'admin2'::uuid),
  'evento de auditoría: id, rol y organizaciones, sin correo ni nombre');

select lives_ok(format('delete from auth.users where id = %L', :'admin2'), 'borrar el usuario de Auth no queda bloqueado por ninguna FK');
select is((select count(*) from public.profiles where id = :'admin2'), 0::bigint, 'el perfil desaparece con el usuario de Auth');
select ok((select count(*) >= 1 from public.change_log where actor_id = :'admin2'::uuid),
  'el historial sobrevive a la purga (actor_id conservado, ahora anónimo)');

select tests.login_as(:'admin');
select is((public.admin_delete_user(:'admin2') ->> 'status')::text, 'profile_missing'::text, 'reintento: sin perfil devuelve profile_missing');
select throws_ok(format('select public.admin_delete_user(%L)', :'admin'), 'P0001', 'cannot_delete_self', 'no puedes eliminarte a ti mismo');
select tests.logout();
update public.profiles set is_active = false where platform_role = 'admin' and id <> :'admin';
select throws_ok(format('select private.purge_user(%L)', :'admin'), 'P0001', 'last_admin', 'no se elimina al último administrador activo');
select tests.login_as(:'tech_a');
select throws_ok(format('select public.admin_delete_user(%L)', :'mgr_a'), '42501', 'not_allowed', 'un técnico no puede eliminar usuarios');

-- Un cliente: membresías fuera y la organización queda en el evento
select tests.login_as(:'admin');
select public.admin_delete_user(:'mgr_a') ->> 'memberships' as mm \gset
select tests.logout();
select is(:'mm'::text, '1', 'se borró su membresía');
select ok((select count(*) = 1 and bool_and(old -> 'organization_ids' @> jsonb_build_array(:'org_a'::text))
    from public.change_log where table_name = 'profiles' and action = 'delete' and row_id = :'mgr_a'::uuid),
  'el evento del cliente nombra su organización');

-- Ninguna FK hacia profiles / auth.users deja la eliminación bloqueada (solo comments.author_id, que la purga resuelve)
select is((select count(*) from pg_constraint c
    join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.confdeltype in ('a', 'r') and n.nspname = 'public' and t.relname <> 'comments'), 0::bigint,
  'ninguna otra FK a profiles/auth.users es RESTRICT/NO ACTION');

select ok(not exists (select 1 from public.change_log where new::text ~ '@' or old::text ~ '@'),
  'ninguna fila del historial contiene correos');
select throws_ok('update public.change_log set action = ''insert''', 'P0001', 'change_log_immutable', 'el historial sigue siendo inmutable');

select * from finish();
rollback;
