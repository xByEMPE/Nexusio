-- Datos de campo por defecto del proyecto (piloto, asistente, dron) y copia automática a cada inspección nueva.
-- Aditiva: no modifica migraciones anteriores ni políticas. Sirve a todos los caminos de alta de inspecciones
-- (portal, app de escritorio por RLS directo e ingest_manifest), porque la copia ocurre en un trigger.
-- Varios nombres de una misma función se guardan unidos con «, » (p. ej. «Ana Pérez, Luis Gómez»).

alter table public.projects
  add column default_pilot_name text check (default_pilot_name is null or char_length(default_pilot_name) <= 500),
  add column default_assistant_name text check (default_assistant_name is null or char_length(default_assistant_name) <= 500),
  add column default_drone_model text check (default_drone_model is null or char_length(default_drone_model) <= 120);

-- Rellena solo lo que viene nulo o vacío; lo que el llamador envía gana siempre. Se llama
-- «inspections_a_defaults» para ejecutarse antes (orden alfabético de triggers BEFORE) que inspections_guard.
create or replace function private.inspection_apply_project_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  -- ingest_manifest hace INSERT ... ON CONFLICT (id) DO UPDATE con coalesce(excluded.x, i.x): este trigger corre
  -- antes de resolver el conflicto, así que si la inspección ya existe NO se aplican defaults (pisarían lo guardado
  -- o editado). Solo las filas realmente nuevas reciben los defaults.
  if exists (select 1 from public.inspections e where e.id = new.id) then
    return new;
  end if;
  if nullif(btrim(coalesce(new.pilot_name, '')), '') is not null
     and nullif(btrim(coalesce(new.assistant_name, '')), '') is not null
     and nullif(btrim(coalesce(new.drone_model, '')), '') is not null then
    return new;
  end if;
  select default_pilot_name, default_assistant_name, default_drone_model into p
    from public.projects where id = new.project_id;
  if not found then
    return new;
  end if;
  if nullif(btrim(coalesce(new.pilot_name, '')), '') is null then
    new.pilot_name := nullif(btrim(coalesce(p.default_pilot_name, '')), '');
  end if;
  if nullif(btrim(coalesce(new.assistant_name, '')), '') is null then
    new.assistant_name := nullif(btrim(coalesce(p.default_assistant_name, '')), '');
  end if;
  if nullif(btrim(coalesce(new.drone_model, '')), '') is null then
    new.drone_model := nullif(btrim(coalesce(p.default_drone_model, '')), '');
  end if;
  return new;
end $$;

revoke execute on function private.inspection_apply_project_defaults() from public, anon, authenticated;

create trigger inspections_a_defaults before insert on public.inspections
  for each row execute function private.inspection_apply_project_defaults();

-- Los datos de campo de una inspección existente los modifica solo el admin. SECURITY INVOKER: current_user es el
-- rol de quien llama (authenticated desde el portal o la app); postgres/service_role y los procesos sin sesión pasan.
-- Excepciones: ingest_manifest (marca nexus.ingest = 'on', como guard_finding_update) y los cambios de posición
-- (asset_lat/lon/source), que la app de escritorio actualiza directo y no se vigilan aquí.
create or replace function private.guard_inspection_field_data() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated'
     and current_setting('nexus.ingest', true) is distinct from 'on'
     and (new.pilot_name is distinct from old.pilot_name
       or new.assistant_name is distinct from old.assistant_name
       or new.drone_model is distinct from old.drone_model
       or new.notes is distinct from old.notes
       or new.blade_length_m is distinct from old.blade_length_m
       or new.inspected_at is distinct from old.inspected_at)
     and not private.is_admin() then
    raise exception 'solo un admin modifica los datos de campo de una inspección' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger inspections_field_data_guard before update on public.inspections
  for each row execute function private.guard_inspection_field_data();
