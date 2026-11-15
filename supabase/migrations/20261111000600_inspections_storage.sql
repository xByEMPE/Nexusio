-- Storage privado: bucket inspection-media y políticas sobre storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-media', 'inspection-media', false, null,
  array['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/xml'])
on conflict (id) do update set
  public = false,
  file_size_limit = null,
  allowed_mime_types = excluded.allowed_mime_types;

-- Segmentos 1-3 de la ruta ({org}/{project}/{inspection}/...). Vacío si la ruta no es válida.
create or replace function private.storage_path_ids(name text)
returns table(org_id uuid, project_id uuid, inspection_id uuid)
language sql immutable security definer set search_path = '' as $$
  select (p[1])::uuid, (p[2])::uuid, (p[3])::uuid
  from (select string_to_array(name, '/') as p) s
  where name is not null
    and name !~ '(\.\.|//)'
    and name !~ '^/'
    and array_length(p, 1) >= 4
    and p[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and p[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and p[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

create or replace function private.storage_can_read(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.storage_path_ids(name) s
    join public.inspections i on i.id = s.inspection_id and i.project_id = s.project_id
    where private.org_of_project(s.project_id) = s.org_id
      and private.can_read_project(s.project_id));
$$;

create or replace function private.storage_can_write(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.storage_path_ids(name) s
    join public.inspections i on i.id = s.inspection_id and i.project_id = s.project_id
    where private.org_of_project(s.project_id) = s.org_id
      and private.can_edit_inspection_data(s.project_id, s.inspection_id));
$$;

revoke execute on function private.storage_path_ids(text), private.storage_can_read(text), private.storage_can_write(text)
  from public, anon;
grant execute on function private.storage_path_ids(text), private.storage_can_read(text), private.storage_can_write(text)
  to authenticated;

create policy inspection_media_select on storage.objects for select to authenticated
  using (bucket_id = 'inspection-media' and private.storage_can_read(name));
create policy inspection_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-media' and private.storage_can_write(name));
create policy inspection_media_update on storage.objects for update to authenticated
  using (bucket_id = 'inspection-media' and private.storage_can_write(name))
  with check (bucket_id = 'inspection-media' and private.storage_can_write(name));
create policy inspection_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-media' and private.is_admin());
