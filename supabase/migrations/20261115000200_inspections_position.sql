-- Posición de la turbina (spec §9.1): sale de la foto `_ID` (punto del láser o GPS del dron).
-- Sin políticas nuevas: las de update de inspecciones ya aplican.
alter table public.inspections
  add column asset_lat double precision check (asset_lat between -90 and 90),
  add column asset_lon double precision check (asset_lon between -180 and 180),
  add column asset_position_source text check (asset_position_source in ('lrf_target', 'gps')),
  add constraint inspections_asset_position_all_or_none check (
    (asset_lat is null and asset_lon is null and asset_position_source is null)
    or (asset_lat is not null and asset_lon is not null and asset_position_source is not null));
