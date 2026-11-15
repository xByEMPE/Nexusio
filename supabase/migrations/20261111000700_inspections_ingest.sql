-- Contrato de subida: public.ingest_manifest (§8 del diseño).
-- security invoker: corre con los permisos del usuario, así que RLS y las políticas de Storage aplican igual.
-- Primero valida todo (consultas por conjuntos, errores acumulados), después inserta. Todo o nada.

create or replace function public.ingest_manifest(p_manifest jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_prev text := current_setting('nexus.ingest', true);
  v_errors jsonb := '[]'::jsonb;
  v_project uuid;
  v_org uuid;
  v_insp jsonb;
  v_insp_id uuid;
  v_kind public.inspection_kind;
  v_existing_project uuid;
  v_caps jsonb;
  v_mosaics jsonb;
  v_finds jsonb;
  v_base text;
  v_ins jsonb := '{}'::jsonb;
  v_upd jsonb := '{}'::jsonb;
  v_n_ins bigint;
  v_n_upd bigint;
  v_skipped jsonb;
begin
  perform set_config('nexus.ingest', 'on', true);

  -- Precondiciones que impiden seguir validando
  if jsonb_typeof(p_manifest) is distinct from 'object'
     or p_manifest -> 'manifest_version' is distinct from '1'::jsonb then
    raise exception using errcode = '22023', message = 'manifest_invalid',
      detail = jsonb_build_array(jsonb_build_object('path', '/manifest_version', 'code', 'unsupported_version'))::text;
  end if;

  v_project := (p_manifest ->> 'project_id')::uuid;
  v_insp := p_manifest -> 'inspection';
  v_insp_id := (v_insp ->> 'id')::uuid;
  v_caps := case when jsonb_typeof(p_manifest -> 'captures') = 'array' then p_manifest -> 'captures' else '[]'::jsonb end;
  v_mosaics := case when jsonb_typeof(p_manifest -> 'mosaics') = 'array' then p_manifest -> 'mosaics' else '[]'::jsonb end;
  v_finds := case when jsonb_typeof(p_manifest -> 'findings') = 'array' then p_manifest -> 'findings' else '[]'::jsonb end;

  v_org := private.org_of_project(v_project);
  if v_org is null or not private.can_write_project(v_project) then
    raise exception using errcode = '22023', message = 'manifest_invalid',
      detail = jsonb_build_array(jsonb_build_object('path', '/project_id', 'code', 'forbidden_project'))::text;
  end if;

  -- Inspección
  select i.kind, i.project_id into v_kind, v_existing_project from public.inspections i where i.id = v_insp_id;
  if found and v_existing_project is distinct from v_project then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('path', '/inspection/id', 'code', 'forbidden_project'));
  end if;
  v_kind := coalesce(v_kind, (v_insp ->> 'kind')::public.inspection_kind);

  if private.inspection_is_locked(v_insp_id) and not private.is_admin() then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('path', '/inspection/id', 'code', 'inspection_locked'));
  end if;

  if not exists (
    select 1 from public.assets a where a.id = (v_insp ->> 'asset_id')::uuid and a.organization_id = v_org) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('path', '/inspection/asset_id', 'code', 'asset_other_org'));
  end if;

  -- Rutas: prefijo propio del registro, sin segmentos .. ni //, y el objeto existe (visible para el llamador)
  v_base := lower(v_org::text || '/' || v_project::text || '/' || v_insp_id::text || '/');
  with paths as (
    select 1 as grp, c.ord, k.key as sub, '/captures/' || (c.ord - 1) || '/paths/' || k.key as jpath,
      k.value #>> '{}' as path, v_base || 'captures/' || lower(c.e ->> 'id') || '/' as prefix
    from jsonb_array_elements(v_caps) with ordinality c(e, ord)
    cross join lateral jsonb_each(case when jsonb_typeof(c.e -> 'paths') = 'object' then c.e -> 'paths' else '{}'::jsonb end) k
    where jsonb_typeof(k.value) <> 'null'
    union all
    select 1, c.ord, '~thermal', '/captures/' || (c.ord - 1) || '/thermal/matrix_path',
      c.e #>> '{thermal,matrix_path}', v_base || 'captures/' || lower(c.e ->> 'id') || '/'
    from jsonb_array_elements(v_caps) with ordinality c(e, ord)
    where jsonb_typeof(c.e #> '{thermal,matrix_path}') = 'string'
    union all
    select 2, m.ord, 'path', '/mosaics/' || (m.ord - 1) || '/path',
      m.e ->> 'path', v_base || 'mosaics/' || lower(m.e ->> 'id') || '/'
    from jsonb_array_elements(v_mosaics) with ordinality m(e, ord)
  ), checked as (
    select p.grp, p.ord, p.sub, p.jpath,
      case
        when p.path is null or p.prefix is null
          or not starts_with(lower(p.path), p.prefix) or length(p.path) <= length(p.prefix)
          or p.path like '%//%' or ('/' || p.path || '/') like '%/../%' then 'bad_path'
        when not exists (
          select 1 from storage.objects o where o.bucket_id = 'inspection-media' and o.name = p.path) then 'missing_object'
      end as code
    from paths p
  )
  select v_errors || coalesce(jsonb_agg(jsonb_build_object('path', jpath, 'code', code) order by grp, ord, sub), '[]'::jsonb)
  into v_errors from checked where code is not null;

  -- sha256 repetido con otro id: dentro del manifiesto o contra la inspección
  with m as (
    select c.ord, (c.e ->> 'id')::uuid as id, c.e ->> 'sha256' as sha
    from jsonb_array_elements(v_caps) with ordinality c(e, ord)
  )
  select v_errors || coalesce(jsonb_agg(jsonb_build_object('path', '/captures/' || (m.ord - 1) || '/sha256',
    'code', 'duplicate_sha256') order by m.ord), '[]'::jsonb)
  into v_errors from m
  where exists (select 1 from m m2 where m2.sha = m.sha and m2.id <> m.id)
     or exists (select 1 from public.captures x where x.inspection_id = v_insp_id and x.sha256 = m.sha and x.id <> m.id);

  -- Tipos de daño del ámbito de la inspección
  select v_errors || coalesce(jsonb_agg(jsonb_build_object('path', '/findings/' || (f.ord - 1) || '/type_code',
    'code', 'unknown_finding_type') order by f.ord), '[]'::jsonb)
  into v_errors
  from jsonb_array_elements(v_finds) with ordinality f(e, ord)
  where not exists (
    select 1 from public.finding_types t where t.domain = v_kind and t.code = f.e ->> 'type_code' and t.is_active);

  -- Referencias a fotos y tiras: del manifiesto o ya guardadas en esta inspección
  with known_c as (
    select (c.e ->> 'id')::uuid as id from jsonb_array_elements(v_caps) c(e)
    union
    select x.id from public.captures x where x.inspection_id = v_insp_id
  ), known_m as (
    select (m.e ->> 'id')::uuid as id from jsonb_array_elements(v_mosaics) m(e)
    union
    select x.id from public.mosaics x where x.inspection_id = v_insp_id
  ), refs as (
    select 1 as grp, 0::bigint as ord, '/inspection/id_capture_id' as jpath, (v_insp ->> 'id_capture_id')::uuid as id, 'c' as kind
    where jsonb_typeof(v_insp -> 'id_capture_id') = 'string'
    union all
    select 2, c.ord, '/captures/' || (c.ord - 1) || '/paired_capture_id', (c.e ->> 'paired_capture_id')::uuid, 'c'
    from jsonb_array_elements(v_caps) with ordinality c(e, ord)
    where jsonb_typeof(c.e -> 'paired_capture_id') = 'string'
    union all
    select 3, f.ord, '/findings/' || (f.ord - 1) || '/capture_id', (f.e ->> 'capture_id')::uuid, 'c'
    from jsonb_array_elements(v_finds) with ordinality f(e, ord)
    where jsonb_typeof(f.e -> 'capture_id') = 'string'
    union all
    select 3, f.ord, '/findings/' || (f.ord - 1) || '/mosaic_id', (f.e ->> 'mosaic_id')::uuid, 'm'
    from jsonb_array_elements(v_finds) with ordinality f(e, ord)
    where jsonb_typeof(f.e -> 'mosaic_id') = 'string'
  )
  select v_errors || coalesce(jsonb_agg(jsonb_build_object('path', r.jpath, 'code', 'unknown_capture')
    order by r.grp, r.ord, r.jpath), '[]'::jsonb)
  into v_errors from refs r
  where (r.kind = 'c' and not exists (select 1 from known_c k where k.id = r.id))
     or (r.kind = 'm' and not exists (select 1 from known_m k where k.id = r.id));

  if jsonb_array_length(v_errors) > 0 then
    raise exception using errcode = '22023', message = 'manifest_invalid', detail = v_errors::text;
  end if;

  -- Inserciones. La inspección conserva activo y tipo; los datos opcionales ausentes no borran los guardados.
  insert into public.inspections as i (id, project_id, asset_id, kind, inspected_at, pilot_name, assistant_name,
    drone_model, blade_length_m, notes)
  values (v_insp_id, v_project, (v_insp ->> 'asset_id')::uuid, (v_insp ->> 'kind')::public.inspection_kind,
    (v_insp ->> 'inspected_at')::timestamptz, v_insp ->> 'pilot_name', v_insp ->> 'assistant_name',
    v_insp ->> 'drone_model', (v_insp ->> 'blade_length_m')::numeric, v_insp ->> 'notes')
  on conflict (id) do update set
    inspected_at = coalesce(excluded.inspected_at, i.inspected_at),
    pilot_name = coalesce(excluded.pilot_name, i.pilot_name),
    assistant_name = coalesce(excluded.assistant_name, i.assistant_name),
    drone_model = coalesce(excluded.drone_model, i.drone_model),
    blade_length_m = coalesce(excluded.blade_length_m, i.blade_length_m),
    notes = coalesce(excluded.notes, i.notes);

  -- Fotos (la pareja se pone después, cuando ya existen las dos)
  with up as (
    insert into public.captures as c (id, project_id, inspection_id, spectrum, sha256, file_name, sequence_index,
      original_path, preview_path, thumb_path, width_px, height_px, captured_at, lat, lon, alt_abs_m, alt_rel_m,
      gimbal_pitch_deg, gimbal_roll_deg, gimbal_yaw_deg, drone_model, camera_model, lrf_distance_m,
      gsd_mm_px, gsd_source, gsd_confidence, metadata)
    select (e ->> 'id')::uuid, v_project, v_insp_id, (e ->> 'spectrum')::public.spectrum, e ->> 'sha256',
      e ->> 'file_name', (e ->> 'sequence_index')::integer,
      e #>> '{paths,original}', e #>> '{paths,preview}', e #>> '{paths,thumb}',
      (e ->> 'width_px')::integer, (e ->> 'height_px')::integer, (e ->> 'captured_at')::timestamptz,
      (e #>> '{gps,lat}')::double precision, (e #>> '{gps,lon}')::double precision,
      (e #>> '{gps,alt_abs_m}')::numeric, (e #>> '{gps,alt_rel_m}')::numeric,
      (e #>> '{gimbal,pitch_deg}')::numeric, (e #>> '{gimbal,roll_deg}')::numeric, (e #>> '{gimbal,yaw_deg}')::numeric,
      e ->> 'drone_model', e ->> 'camera_model', (e ->> 'lrf_distance_m')::numeric,
      (e #>> '{gsd,mm_px}')::numeric, (e #>> '{gsd,source}')::public.gsd_source,
      (e #>> '{gsd,confidence}')::public.confidence_level,
      case when jsonb_typeof(e -> 'metadata') = 'object' then e -> 'metadata' else '{}'::jsonb end
    from jsonb_array_elements(v_caps) e
    on conflict (id) do update set
      spectrum = excluded.spectrum, sha256 = excluded.sha256, file_name = excluded.file_name,
      sequence_index = excluded.sequence_index, original_path = excluded.original_path,
      preview_path = excluded.preview_path, thumb_path = excluded.thumb_path,
      width_px = excluded.width_px, height_px = excluded.height_px, captured_at = excluded.captured_at,
      lat = excluded.lat, lon = excluded.lon, alt_abs_m = excluded.alt_abs_m, alt_rel_m = excluded.alt_rel_m,
      gimbal_pitch_deg = excluded.gimbal_pitch_deg, gimbal_roll_deg = excluded.gimbal_roll_deg,
      gimbal_yaw_deg = excluded.gimbal_yaw_deg, drone_model = excluded.drone_model,
      camera_model = excluded.camera_model, lrf_distance_m = excluded.lrf_distance_m,
      gsd_mm_px = excluded.gsd_mm_px, gsd_source = excluded.gsd_source, gsd_confidence = excluded.gsd_confidence,
      metadata = excluded.metadata
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new) into v_n_ins, v_n_upd from up;
  v_ins := v_ins || jsonb_build_object('captures', v_n_ins);
  v_upd := v_upd || jsonb_build_object('captures', v_n_upd);

  update public.captures c set paired_capture_id = (e ->> 'paired_capture_id')::uuid
  from jsonb_array_elements(v_caps) e
  where c.id = (e ->> 'id')::uuid and c.paired_capture_id is distinct from (e ->> 'paired_capture_id')::uuid;

  -- Datos de pala
  with up as (
    insert into public.blade_captures as b (capture_id, project_id, blade, face, radius_center_m,
      sequence_direction, chord_length_mm)
    select (e ->> 'id')::uuid, v_project, (e #>> '{blade,position}')::public.blade_position,
      (e #>> '{blade,face}')::public.blade_face, (e #>> '{blade,radius_center_m}')::numeric,
      coalesce((e #>> '{blade,sequence_direction}')::public.sequence_direction, 'unknown'),
      (e #>> '{blade,chord_length_mm}')::numeric
    from jsonb_array_elements(v_caps) e
    where jsonb_typeof(e -> 'blade') = 'object'
    on conflict (capture_id) do update set
      blade = excluded.blade, face = excluded.face, radius_center_m = excluded.radius_center_m,
      sequence_direction = excluded.sequence_direction, chord_length_mm = excluded.chord_length_mm
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new) into v_n_ins, v_n_upd from up;
  v_ins := v_ins || jsonb_build_object('blade_captures', v_n_ins);
  v_upd := v_upd || jsonb_build_object('blade_captures', v_n_upd);

  -- Datos térmicos
  with up as (
    insert into public.thermal_captures as t (capture_id, project_id, matrix_path, temp_scale, temp_offset,
      t_min_c, t_max_c, emissivity, distance_m, humidity_pct, ambient_temp_c, reflected_temp_c)
    select (e ->> 'id')::uuid, v_project, e #>> '{thermal,matrix_path}',
      coalesce((e #>> '{thermal,temp_scale}')::numeric, 0.01), coalesce((e #>> '{thermal,temp_offset}')::numeric, -100),
      (e #>> '{thermal,t_min_c}')::numeric, (e #>> '{thermal,t_max_c}')::numeric,
      (e #>> '{thermal,emissivity}')::numeric, (e #>> '{thermal,distance_m}')::numeric,
      (e #>> '{thermal,humidity_pct}')::numeric, (e #>> '{thermal,ambient_temp_c}')::numeric,
      (e #>> '{thermal,reflected_temp_c}')::numeric
    from jsonb_array_elements(v_caps) e
    where jsonb_typeof(e -> 'thermal') = 'object'
    on conflict (capture_id) do update set
      matrix_path = excluded.matrix_path, temp_scale = excluded.temp_scale, temp_offset = excluded.temp_offset,
      t_min_c = excluded.t_min_c, t_max_c = excluded.t_max_c, emissivity = excluded.emissivity,
      distance_m = excluded.distance_m, humidity_pct = excluded.humidity_pct,
      ambient_temp_c = excluded.ambient_temp_c, reflected_temp_c = excluded.reflected_temp_c
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new) into v_n_ins, v_n_upd from up;
  v_ins := v_ins || jsonb_build_object('thermal_captures', v_n_ins);
  v_upd := v_upd || jsonb_build_object('thermal_captures', v_n_upd);

  -- Tiras. Sin bloque de calibración, se conserva la guardada.
  with up as (
    insert into public.mosaics as m (id, project_id, inspection_id, kind, spectrum, blade, face, format, path,
      width_px, height_px, tip_row_px, root_row_px, blade_length_m, mm_per_px, root_at_top, calibrated_by, calibrated_at)
    select (e ->> 'id')::uuid, v_project, v_insp_id, (e ->> 'kind')::public.mosaic_kind,
      (e ->> 'spectrum')::public.spectrum, (e ->> 'blade')::public.blade_position, (e ->> 'face')::public.blade_face,
      coalesce((e ->> 'format')::public.mosaic_format, 'image'), e ->> 'path',
      (e ->> 'width_px')::integer, (e ->> 'height_px')::integer,
      (e #>> '{calibration,tip_row_px}')::integer, (e #>> '{calibration,root_row_px}')::integer,
      (e #>> '{calibration,blade_length_m}')::numeric, (e #>> '{calibration,mm_per_px}')::numeric,
      (e #>> '{calibration,root_at_top}')::boolean,
      case when jsonb_typeof(e -> 'calibration') = 'object' then (select auth.uid()) end,
      case when jsonb_typeof(e -> 'calibration') = 'object' then now() end
    from jsonb_array_elements(v_mosaics) e
    on conflict (id) do update set
      kind = excluded.kind, spectrum = excluded.spectrum, blade = excluded.blade, face = excluded.face,
      format = excluded.format, path = excluded.path, width_px = excluded.width_px, height_px = excluded.height_px,
      tip_row_px = case when excluded.calibrated_at is null then m.tip_row_px else excluded.tip_row_px end,
      root_row_px = case when excluded.calibrated_at is null then m.root_row_px else excluded.root_row_px end,
      blade_length_m = case when excluded.calibrated_at is null then m.blade_length_m else excluded.blade_length_m end,
      mm_per_px = case when excluded.calibrated_at is null then m.mm_per_px else excluded.mm_per_px end,
      root_at_top = case when excluded.calibrated_at is null then m.root_at_top else excluded.root_at_top end,
      calibrated_by = case when excluded.calibrated_at is null then m.calibrated_by else excluded.calibrated_by end,
      calibrated_at = coalesce(excluded.calibrated_at, m.calibrated_at)
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) filter (where not is_new) into v_n_ins, v_n_upd from up;
  v_ins := v_ins || jsonb_build_object('mosaics', v_n_ins);
  v_upd := v_upd || jsonb_build_object('mosaics', v_n_upd);

  -- Daños. Los ya corregidos por el personal no se tocan y se informan en skipped.
  with up as (
    insert into public.findings as f (id, project_id, inspection_id, capture_id, mosaic_id, type_id, severity,
      region, width_mm, length_mm, area_mm2, radius_m, max_temp_c, delta_t_c, gsd_mm_px_used, source,
      ai_confidence, ai_model, ai_model_version, ai_original, notes)
    select (e ->> 'id')::uuid, v_project, v_insp_id, (e ->> 'capture_id')::uuid, (e ->> 'mosaic_id')::uuid,
      t.id, (e ->> 'severity')::smallint, e -> 'region',
      (e #>> '{measurements,width_mm}')::numeric, (e #>> '{measurements,length_mm}')::numeric,
      (e #>> '{measurements,area_mm2}')::numeric, (e #>> '{measurements,radius_m}')::numeric,
      (e #>> '{measurements,max_temp_c}')::numeric, (e #>> '{measurements,delta_t_c}')::numeric,
      (e #>> '{measurements,gsd_mm_px_used}')::numeric, (e ->> 'source')::public.finding_source,
      (e #>> '{ai,confidence}')::numeric, e #>> '{ai,model}', e #>> '{ai,version}',
      case when e ->> 'source' = 'ai' then e end, e ->> 'notes'
    from jsonb_array_elements(v_finds) e
    join public.finding_types t on t.domain = v_kind and t.code = e ->> 'type_code'
    on conflict (id) do update set
      type_id = excluded.type_id, severity = excluded.severity, region = excluded.region,
      width_mm = excluded.width_mm, length_mm = excluded.length_mm, area_mm2 = excluded.area_mm2,
      radius_m = excluded.radius_m, max_temp_c = excluded.max_temp_c, delta_t_c = excluded.delta_t_c,
      gsd_mm_px_used = excluded.gsd_mm_px_used, ai_confidence = excluded.ai_confidence,
      ai_model = excluded.ai_model, ai_model_version = excluded.ai_model_version,
      notes = coalesce(excluded.notes, f.notes)
    where f.corrected_at is null
    returning f.id, (xmax = 0) as is_new
  )
  select count(*) filter (where u.is_new), count(*) filter (where not u.is_new),
    (select coalesce(jsonb_agg(x.e ->> 'id' order by x.ord), '[]'::jsonb)
     from jsonb_array_elements(v_finds) with ordinality x(e, ord)
     where not exists (select 1 from up u2 where u2.id = (x.e ->> 'id')::uuid))
  into v_n_ins, v_n_upd, v_skipped
  from up u;
  v_ins := v_ins || jsonb_build_object('findings', v_n_ins);
  v_upd := v_upd || jsonb_build_object('findings', v_n_upd);

  -- Foto de identificación y estado
  if jsonb_typeof(v_insp -> 'id_capture_id') = 'string' then
    update public.inspections set id_capture_id = (v_insp ->> 'id_capture_id')::uuid
    where id = v_insp_id and id_capture_id is distinct from (v_insp ->> 'id_capture_id')::uuid;
  end if;
  update public.inspections set status = 'in_review'
  where id = v_insp_id and status in ('pending', 'captured', 'processing');

  perform set_config('nexus.ingest', coalesce(v_prev, ''), true);

  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'skipped', jsonb_build_object('findings', v_skipped));
end $$;

revoke execute on function public.ingest_manifest(jsonb) from public, anon;
grant execute on function public.ingest_manifest(jsonb) to authenticated;
