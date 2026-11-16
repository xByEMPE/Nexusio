import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapStatus } from "@/lib/inspections/map";
import type { Database } from "@/services/supabase/database.types";
import { signPaths } from "./media";

export type Sev = 1 | 2 | 3 | 4 | 5;

export type MapTurbine = {
  assetId: string;
  name: string;
  lat: number | null;
  lon: number | null;
  status: MapStatus | null;
  maxSeverity: Sev | null;
  counts: Record<Sev, number>;
  inspectionHref: string | null;
  idThumbUrl: string | null;
};

type Scope = "admin" | "portal";

function hrefFor(scope: Scope, projectId: string, inspectionId: string): string {
  return scope === "admin"
    ? `/admin/inspecciones/proyectos/${projectId}/inspecciones/${inspectionId}`
    : `/portal/proyectos/${projectId}/inspecciones/${inspectionId}`;
}

const emptyCounts = (): Record<Sev, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
const isSev = (n: number): n is Sev => Number.isInteger(n) && n >= 1 && n <= 5;

type AssetRow = { id: string; name: string; lat: number | null; lon: number | null };

/**
 * Arma los marcadores con la sesión del usuario (RLS decide qué inspecciones y daños ve).
 * Un cliente solo ve sus proyectos; los daños no visibles no cuentan en severidad ni totales.
 */
async function build(sb: SupabaseClient<Database>, assets: AssetRow[], projectId: string | null, scope: Scope): Promise<MapTurbine[]> {
  if (assets.length === 0) return [];
  const ids = assets.map((a) => a.id);
  let q = sb
    .from("inspections")
    .select("id, project_id, asset_id, status, created_at, asset_lat, asset_lon, id_capture_id")
    .in("asset_id", ids)
    .order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", projectId);
  const { data: insp, error: inspErr } = await q;
  if (inspErr) console.error("[map-data] inspecciones:", inspErr.message);

  const latest = new Map<string, NonNullable<typeof insp>[number]>();
  const withPos = new Map<string, NonNullable<typeof insp>[number]>();
  for (const i of insp ?? []) {
    if (!latest.has(i.asset_id)) latest.set(i.asset_id, i);
    if (!withPos.has(i.asset_id) && i.asset_lat != null && i.asset_lon != null) withPos.set(i.asset_id, i);
  }

  const inspIds = [...latest.values()].map((i) => i.id);
  const idCaptureIds = [...latest.values()].flatMap((i) => (i.id_capture_id ? [i.id_capture_id] : []));
  const [findings, caps] = await Promise.all([
    inspIds.length ? sb.from("findings").select("inspection_id, severity").in("inspection_id", inspIds) : Promise.resolve({ data: [], error: null }),
    idCaptureIds.length ? sb.from("captures").select("id, thumb_path, preview_path").in("id", idCaptureIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (findings.error) console.error("[map-data] daños:", findings.error.message);
  if (caps.error) console.error("[map-data] capturas _ID:", caps.error.message);

  const byInsp = new Map<string, Record<Sev, number>>();
  for (const f of findings.data ?? []) {
    if (!isSev(f.severity)) continue;
    const c = byInsp.get(f.inspection_id) ?? emptyCounts();
    c[f.severity]++;
    byInsp.set(f.inspection_id, c);
  }
  const capPath = new Map((caps.data ?? []).map((c) => [c.id, c.thumb_path ?? c.preview_path ?? ""]));
  const signed = await signPaths(sb, [...capPath.values()]);

  return assets.map((a): MapTurbine => {
    const cur = latest.get(a.id) ?? null;
    const pos = withPos.get(a.id);
    const assetHasPos = a.lat != null && a.lon != null;
    const counts = (cur && byInsp.get(cur.id)) ?? emptyCounts();
    const sevs = ([1, 2, 3, 4, 5] as Sev[]).filter((s) => counts[s] > 0);
    const thumbPath = cur?.id_capture_id ? capPath.get(cur.id_capture_id) : undefined;
    return {
      assetId: a.id,
      name: a.name,
      lat: assetHasPos ? a.lat : (pos?.asset_lat ?? null),
      lon: assetHasPos ? a.lon : (pos?.asset_lon ?? null),
      status: cur?.status ?? null,
      maxSeverity: sevs.length ? sevs[sevs.length - 1]! : null,
      counts,
      inspectionHref: cur ? hrefFor(scope, cur.project_id, cur.id) : null,
      idThumbUrl: thumbPath ? (signed.get(thumbPath) ?? null) : null,
    };
  });
}

export async function loadSiteMap(sb: SupabaseClient<Database>, siteId: string, scope: Scope = "admin"): Promise<MapTurbine[]> {
  const { data, error } = await sb.from("assets").select("id, name, lat, lon").eq("site_id", siteId).eq("kind", "wind_turbine").order("name");
  if (error) console.error("[map-data] activos del sitio:", error.message);
  return build(sb, data ?? [], null, scope);
}

export async function loadProjectMap(sb: SupabaseClient<Database>, projectId: string, scope: Scope = "admin"): Promise<MapTurbine[]> {
  const { data: links, error: linkErr } = await sb.from("project_sites").select("site_id").eq("project_id", projectId);
  if (linkErr) console.error("[map-data] sitios del proyecto:", linkErr.message);
  const siteIds = (links ?? []).map((l) => l.site_id);
  if (siteIds.length === 0) return [];
  const { data, error } = await sb.from("assets").select("id, name, lat, lon").in("site_id", siteIds).eq("kind", "wind_turbine").order("name");
  if (error) console.error("[map-data] activos del proyecto:", error.message);
  return build(sb, data ?? [], projectId, scope);
}
