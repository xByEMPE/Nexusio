-- Estado y municipio de cada sitio (catálogo de parques eólicos).
-- Idempotente: en producción las columnas ya existen (las agregó la carga del catálogo); aquí solo se
-- versionan para que una base nueva (local, pruebas) tenga el mismo esquema. No toca datos.
alter table public.sites
  add column if not exists state text check (state is null or char_length(state) between 1 and 120),
  add column if not exists city text check (city is null or char_length(city) between 1 and 120);

comment on column public.sites.state is 'Entidad federativa del sitio (informativa, del catálogo de parques).';
comment on column public.sites.city is 'Municipio o localidad del sitio (informativa, del catálogo de parques).';
