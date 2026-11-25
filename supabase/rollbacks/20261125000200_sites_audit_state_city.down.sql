drop trigger if exists sites_audit on public.sites;
create trigger sites_audit after insert or update or delete on public.sites
  for each row execute function private.audit_change('organization_id', 'kind', 'name', 'lat', 'lon');
