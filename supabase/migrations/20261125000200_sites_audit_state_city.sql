-- La auditoría de sitios incluye estado y municipio (lista blanca aditiva). Solo recrea el trigger; no toca datos.
drop trigger if exists sites_audit on public.sites;
create trigger sites_audit after insert or update or delete on public.sites
  for each row execute function private.audit_change('organization_id', 'kind', 'name', 'lat', 'lon', 'state', 'city');
