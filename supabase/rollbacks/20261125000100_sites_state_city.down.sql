-- OJO: en producción estas columnas contienen datos del catálogo; no ejecutar allí sin respaldo.
alter table public.sites drop column if exists city, drop column if exists state;
