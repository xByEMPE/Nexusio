import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapStatus } from "@/lib/inspections/map";
import type { Database } from "@/services/supabase/database.types";
import { captureVersion, mediaUrl } from "@/lib/inspections/media-url";

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

/**
 * URL de la miniatura de la foto `_ID` (miniatura o, si no hay, vista previa) vía `/api/media/idthumb`,
 * con versión de contenido (`sha256` + ruta). Ya no se firma nada por render.
 */
export function idThumbUrlFor(cap: { id: string; thumb_path: string | null; preview_path: string | null; sha256: string; updated_at: string } | undefined): string | null {
  const path = cap ? (cap.thumb_path ?? cap.preview_path) : null;
  return cap && path ? mediaUrl("idthumb", cap.id, captureVersion(cap.sha256, path, cap.updated_at)) : null;
}

type AssetRow = { id: string; name: string; lat: number | null; lon: number | null };

/**
 * Arma los marcadores con la sesión del usuario (RLS decide qué inspecciones y daños ve).
 * Un cliente solo ve sus proyectos; los daños no visibles no cuentan en severidad ni totales.
 * Solo cuentan los daños confirmados (en admin también): el color es la «severidad máxima visible»,
 * igual que en la vista del cliente; los detectados (IA) y descartados no tiñen el marcador.
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
    inspIds.length ? sb.from("findings").select("inspection_id, severity").in("inspection_id", inspIds).eq("status", "confirmed") : Promise.resolve({ data: [], error: null }),
    idCaptureIds.length ? sb.from("captures").select("id, thumb_path, preview_path, sha256, updated_at").in("id", idCaptureIds) : Promise.resolve({ data: [], error: null }),
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
  const capById = new Map((caps.data ?? []).map((c) => [c.id, c]));

  return assets.map((a): MapTurbine => {
    const cur = latest.get(a.id) ?? null;
    const pos = withPos.get(a.id);
    const assetHasPos = a.lat != null && a.lon != null;
    const counts = (cur && byInsp.get(cur.id)) ?? emptyCounts();
    const sevs = ([1, 2, 3, 4, 5] as Sev[]).filter((s) => counts[s] > 0);
    return {
      assetId: a.id,
      name: a.name,
      lat: assetHasPos ? a.lat : (pos?.asset_lat ?? null),
      lon: assetHasPos ? a.lon : (pos?.asset_lon ?? null),
      status: cur?.status ?? null,
      maxSeverity: sevs.length ? sevs[sevs.length - 1]! : null,
      counts,
      inspectionHref: cur ? hrefFor(scope, cur.project_id, cur.id) : null,
      idThumbUrl: idThumbUrlFor(cur?.id_capture_id ? capById.get(cur.id_capture_id) : undefined),
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
