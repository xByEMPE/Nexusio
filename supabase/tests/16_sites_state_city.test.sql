begin;
\ir helpers.psql
select plan(5);

select w ->> 'org_a' as org_a, w ->> 'admin' as admin
from (select tests.make_world() as w) s \gset

select is((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sites' and column_name in ('state', 'city')),
  2::bigint, 'sites tiene state y city');

-- La migración es idempotente (en producción las columnas ya existen): repetirla no falla ni borra datos.
insert into public.sites (organization_id, kind, name, state, city) values (:'org_a', 'wind_farm', 'Parque ficticio', 'Estado X', 'Municipio Y')
  returning id as s1 \gset
select lives_ok($$alter table public.sites add column if not exists state text, add column if not exists city text$$, 'agregar de nuevo las columnas no falla');
select is((select state || '|' || city from public.sites where id = :'s1'), 'Estado X|Municipio Y', 'los datos se conservan');

-- Opcionales: un sitio sin estado ni municipio sigue siendo válido
select lives_ok(format($$insert into public.sites (organization_id, kind, name) values (%L, 'wind_farm', 'Sin ubicación')$$, :'org_a'), 'state y city son opcionales');

-- La auditoría de sitios incluye estado y municipio
update public.sites set state = 'Estado Z' where id = :'s1';
select ok((select count(*) = 1 from public.change_log where table_name = 'sites' and row_id = :'s1' and action = 'update' and new ->> 'state' = 'Estado Z' and old ->> 'state' = 'Estado X'),
  'el cambio de estado de un sitio queda en el registro de cambios');

select * from finish();
rollback;
