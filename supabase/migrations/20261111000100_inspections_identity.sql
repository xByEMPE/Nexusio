-- Identidad: tipos, perfiles, organizaciones, miembros y funciones de permiso.

create schema if not exists private;
grant usage on schema private to authenticated;

create type public.platform_role as enum ('admin', 'technician', 'service');
create type public.org_member_role as enum ('client_manager', 'client_viewer');

create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  platform_role public.platform_role,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_member_role not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function private.set_updated_at();

-- Funciones de permiso (todas exigen perfil activo)
create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_active from public.profiles p where p.id = (select auth.uid())), false);
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.platform_role = 'admin');
$$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.platform_role in ('admin', 'technician'));
$$;

create or replace function private.is_org_member(o uuid, roles public.org_member_role[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = o and m.user_id = (select auth.uid()) and p.is_active
      and (roles is null or m.role = any (roles)));
$$;

create or replace function private.can_read_org(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_org_member(o);
$$;

-- handle_new_user: perfil sin rol
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Personal de NEXUS y miembro de cliente son excluyentes
create or replace function private.guard_staff_vs_client() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'profiles' then
    if new.platform_role is not null and exists (
      select 1 from public.organization_members m where m.user_id = new.id) then
      raise exception 'un miembro de cliente no puede tener rol de personal' using errcode = 'P0001';
    end if;
  else
    if exists (select 1 from public.profiles p where p.id = new.user_id and p.platform_role is not null) then
      raise exception 'el personal de NEXUS no puede ser miembro de una organización cliente' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard_role before insert or update of platform_role on public.profiles
  for each row execute function private.guard_staff_vs_client();
create trigger members_guard_staff before insert or update of user_id on public.organization_members
  for each row execute function private.guard_staff_vs_client();

-- Solo el admin (o procesos sin sesión, p. ej. SQL directo) cambia rol y estado
create or replace function private.guard_profile_privileged() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.platform_role is distinct from old.platform_role or new.is_active is distinct from old.is_active)
     and (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'solo un admin puede cambiar el rol o el estado' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard_privileged before update on public.profiles
  for each row execute function private.guard_profile_privileged();

-- RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_staff());
create policy profiles_update on public.profiles for update to authenticated
  using ((id = (select auth.uid()) and private.is_active_user()) or private.is_admin())
  with check ((id = (select auth.uid()) and private.is_active_user()) or private.is_admin());

create policy organizations_select on public.organizations for select to authenticated
  using (private.can_read_org(id));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (private.is_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy organizations_delete on public.organizations for delete to authenticated
  using (private.is_admin());

create policy members_select on public.organization_members for select to authenticated
  using (private.is_admin() or (user_id = (select auth.uid()) and private.is_active_user()));
create policy members_insert on public.organization_members for insert to authenticated
  with check (private.is_admin());
create policy members_update on public.organization_members for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy members_delete on public.organization_members for delete to authenticated
  using (private.is_admin());

-- Privilegios
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public, anon;
