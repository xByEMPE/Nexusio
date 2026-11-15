-- Datos locales de prueba (solo para `supabase db reset` en 127.0.0.1).
-- Contraseña común de todos los usuarios locales: Nexus-Local-2026!
--   admin@nexus.local (admin)            tecnico@nexus.local (technician, proyecto Cliente A)
--   servicio@nexus.local (service, proyecto Cliente A)
--   gerente@cliente-a.local (client_manager A)  lector@cliente-a.local (client_viewer A)
--   gerente@cliente-b.local (client_manager B)

do $$
declare
  u record;
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  site_a uuid := gen_random_uuid();
  site_b uuid := gen_random_uuid();
  proj_a uuid := gen_random_uuid();
  proj_b uuid := gen_random_uuid();
  asset_id uuid;
  wtg01_a uuid;
  wtg01_b uuid;
  n text;
begin
  -- Usuarios (el trigger handle_new_user crea el perfil sin rol)
  for u in
    select * from (values
      ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@nexus.local', 'Admin Local', 'admin'),
      ('00000000-0000-4000-8000-000000000002'::uuid, 'tecnico@nexus.local', 'Técnico Local', 'technician'),
      ('00000000-0000-4000-8000-000000000003'::uuid, 'servicio@nexus.local', 'Servicio Local', 'service'),
      ('00000000-0000-4000-8000-000000000004'::uuid, 'gerente@cliente-a.local', 'Gerente Cliente A', null),
      ('00000000-0000-4000-8000-000000000005'::uuid, 'lector@cliente-a.local', 'Lector Cliente A', null),
      ('00000000-0000-4000-8000-000000000006'::uuid, 'gerente@cliente-b.local', 'Gerente Cliente B', null)
    ) as t(id, email, full_name, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      crypt('Nexus-Local-2026!', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', u.full_name), now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    );
    if u.role is not null then
      update public.profiles set platform_role = u.role::public.platform_role, full_name = u.full_name where id = u.id;
    else
      update public.profiles set full_name = u.full_name where id = u.id;
    end if;
  end loop;

  -- Organizaciones y miembros
  insert into public.organizations (id, name, slug) values
    (org_a, 'Cliente A', 'cliente-a'), (org_b, 'Cliente B', 'cliente-b');
  insert into public.organization_members (organization_id, user_id, role) values
    (org_a, '00000000-0000-4000-8000-000000000004', 'client_manager'),
    (org_a, '00000000-0000-4000-8000-000000000005', 'client_viewer'),
    (org_b, '00000000-0000-4000-8000-000000000006', 'client_manager');

  -- Parques
  insert into public.sites (id, organization_id, kind, name, lat, lon) values
    (site_a, org_a, 'wind_farm', 'Parque Demo A', 41.65, -0.88),
    (site_b, org_b, 'wind_farm', 'Parque Demo B', 42.80, -1.64);

  -- Turbinas
  insert into public.assets (organization_id, site_id, kind, name, code)
    values (org_a, site_a, 'wind_turbine', 'WTG-01', 'WTG-01') returning id into wtg01_a;
  insert into public.wind_turbine_specs (asset_id, manufacturer, model, blade_length_m) values (wtg01_a, 'Vestas', 'V136', 66.7);
  insert into public.assets (organization_id, site_id, kind, name, code)
    values (org_a, site_a, 'wind_turbine', 'WTG-02', 'WTG-02') returning id into asset_id;
  insert into public.wind_turbine_specs (asset_id, manufacturer, model, blade_length_m) values (asset_id, 'Vestas', 'V136', 66.7);
  insert into public.assets (organization_id, site_id, kind, name, code)
    values (org_b, site_b, 'wind_turbine', 'WTG-01', 'WTG-01') returning id into wtg01_b;
  insert into public.wind_turbine_specs (asset_id, manufacturer, model, blade_length_m) values (wtg01_b, 'Vestas', 'V136', 66.7);

  -- Proyectos
  insert into public.projects (id, organization_id, name, code, status, start_date, end_date) values
    (proj_a, org_a, 'Inspección 2026 A', 'INS-2026-A', 'in_field', '2026-01-01', '2026-12-31'),
    (proj_b, org_b, 'Inspección 2026 B', 'INS-2026-B', 'in_field', '2026-01-01', '2026-12-31');
  insert into public.project_sites (project_id, site_id) values (proj_a, site_a), (proj_b, site_b);
  insert into public.project_assignments (project_id, user_id) values
    (proj_a, '00000000-0000-4000-8000-000000000002'),
    (proj_a, '00000000-0000-4000-8000-000000000003');

  -- Inspecciones
  insert into public.inspections (project_id, asset_id, kind, status) values
    (proj_a, wtg01_a, 'wind_blade', 'pending'),
    (proj_b, wtg01_b, 'wind_blade', 'pending');
end $$;
