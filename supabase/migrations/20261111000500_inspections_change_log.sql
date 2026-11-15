-- Historial de cambios (§6.5): solo se escribe por trigger y no se puede alterar.
create table public.change_log (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid,
  old jsonb,
  new jsonb,
  at timestamptz not null default now()
);
create index change_log_project_at_idx on public.change_log (project_id, at desc);

alter table public.change_log enable row level security;
create policy change_log_select on public.change_log for select to authenticated
  using (private.is_staff() and private.can_read_project(project_id));
revoke all on public.change_log from public, anon, authenticated;
grant select on public.change_log to authenticated;

-- Inmutabilidad
create or replace function private.change_log_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'change_log_immutable' using errcode = 'P0001';
end $$;
create trigger change_log_immutable before update or delete on public.change_log
  for each row execute function private.change_log_immutable();

-- Auditoría. TG_ARGV = columnas vigiladas (vacío = todas menos updated_at).
create or replace function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_src jsonb;
  v_cols text[];
  v_changed text[];
  v_row uuid;
  v_project uuid;
begin
  if TG_OP = 'DELETE' then v_src := to_jsonb(OLD); else v_src := to_jsonb(NEW); end if;

  if TG_NARGS > 0 then
    v_cols := TG_ARGV;
  else
    select array_agg(k) into v_cols from jsonb_object_keys(v_src) k where k <> 'updated_at';
  end if;

  if TG_OP = 'INSERT' then
    v_new := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(NEW)) e where e.key = any (v_cols));
  elsif TG_OP = 'DELETE' then
    v_old := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(OLD)) e where e.key = any (v_cols));
  else
    select array_agg(c) into v_changed from unnest(v_cols) c
      where to_jsonb(OLD) -> c is distinct from to_jsonb(NEW) -> c;
    if v_changed is null then return null; end if;
    v_old := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(OLD)) e where e.key = any (v_changed));
    v_new := (select coalesce(jsonb_object_agg(e.key, e.value), '{}') from jsonb_each(to_jsonb(NEW)) e where e.key = any (v_changed));
  end if;

  v_row := coalesce(v_src ->> 'id', v_src ->> 'capture_id')::uuid;
  v_project := (v_src ->> 'project_id')::uuid;

  insert into public.change_log (project_id, table_name, row_id, action, actor_id, old, new)
  values (v_project, TG_TABLE_NAME, v_row, lower(TG_OP), (select auth.uid()), v_old, v_new);
  return null;
end $$;
revoke execute on function private.audit_change(), private.change_log_immutable() from public, anon, authenticated;

create trigger findings_audit after insert or update or delete on public.findings
  for each row execute function private.audit_change();
create trigger captures_audit after insert or update or delete on public.captures
  for each row execute function private.audit_change('gsd_mm_px', 'gsd_source', 'gsd_confidence');
create trigger blade_captures_audit after insert or update or delete on public.blade_captures
  for each row execute function private.audit_change('radius_center_m', 'face');
create trigger mosaics_audit after insert or update or delete on public.mosaics
  for each row execute function private.audit_change('tip_row_px', 'root_row_px', 'blade_length_m', 'mm_per_px', 'root_at_top');
create trigger inspections_audit after insert or update or delete on public.inspections
  for each row execute function private.audit_change('blade_length_m', 'status');
