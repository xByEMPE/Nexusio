import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/services/supabase/database.types";
import {
  applyActivityQuery,
  buildActivityEntries,
  collectLookupIds,
  emptyLookups,
  paginate,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityLookups,
  type ActivityScope,
  type LogRow,
} from "./activity-log";

type Client = SupabaseClient<Database>;

export type ActivityPage =
  | { ok: true; entries: ActivityEntry[]; nextCursor: number | null }
  | { ok: false; message: string };

const FORBIDDEN = "No tienes permiso para ver el registro de cambios.";
const FAILED = "No se pudo leer el registro de cambios.";
const MAX_SEARCH_IDS = 100;

/** Ids de objetos, proyectos y personas cuyo nombre contiene el texto buscado (una consulta por tipo, en paralelo). */
async function searchIds(sb: Client, q: string): Promise<string[]> {
  const like = `%${q}%`;
  const [projects, sites, assets, orgs, types, users] = await Promise.all([
    sb.from("projects").select("id").ilike("name", like).limit(MAX_SEARCH_IDS),
    sb.from("sites").select("id").ilike("name", like).limit(MAX_SEARCH_IDS),
    sb.from("assets").select("id").ilike("name", like).limit(MAX_SEARCH_IDS),
    sb.from("organizations").select("id").ilike("name", like).limit(MAX_SEARCH_IDS),
    sb.from("finding_types").select("id").ilike("label_es", like).limit(MAX_SEARCH_IDS),
    sb.from("profiles").select("id").ilike("full_name", like).limit(MAX_SEARCH_IDS),
  ]);
  const ids = [projects, sites, assets, orgs, types, users].flatMap((r) => (r.data ?? []).map((x) => x.id));
  return [...new Set(ids)].slice(0, MAX_SEARCH_IDS);
}

const idMap = <T extends { id: string }>(rows: T[] | null, value: (r: T) => string | null): Map<string, string> =>
  new Map((rows ?? []).flatMap((r) => { const v = value(r); return v ? [[r.id, v] as const] : []; }));

/** Resuelve todos los nombres de una página con una consulta por tabla (sin N+1); los activos, en dos pasadas por las inspecciones. */
async function loadLookups(sb: Client, rows: LogRow[]): Promise<ActivityLookups | null> {
  const want = collectLookupIds(rows);
  const l = emptyLookups();
  const none = <T,>() => Promise.resolve({ data: [] as T[], error: null });
  const [users, projects, orgs, sites, assets, inspections, captures, findings, types] = await Promise.all([
    want.users.length ? sb.from("profiles").select("id, full_name, platform_role").in("id", want.users) : none<{ id: string; full_name: string | null; platform_role: string | null }>(),
    want.projects.length ? sb.from("projects").select("id, name").in("id", want.projects) : none<{ id: string; name: string }>(),
    want.organizations.length ? sb.from("organizations").select("id, name").in("id", want.organizations) : none<{ id: string; name: string }>(),
    want.sites.length ? sb.from("sites").select("id, name").in("id", want.sites) : none<{ id: string; name: string }>(),
    want.assets.length ? sb.from("assets").select("id, name").in("id", want.assets) : none<{ id: string; name: string }>(),
    want.inspections.length ? sb.from("inspections").select("id, asset_id").in("id", want.inspections) : none<{ id: string; asset_id: string }>(),
    want.captures.length ? sb.from("captures").select("id, file_name").in("id", want.captures) : none<{ id: string; file_name: string }>(),
    want.findings.length ? sb.from("findings").select("id, type_id").in("id", want.findings) : none<{ id: string; type_id: string }>(),
    sb.from("finding_types").select("id, label_es"),
  ]);
  // Si no se pueden leer los perfiles, todos los autores se verían como «Usuario eliminado»: mejor fallar.
  if (users.error) return null;
  for (const u of users.data ?? []) l.users.set(u.id, { name: u.full_name, role: u.platform_role });
  l.projects = idMap(projects.data, (r) => r.name);
  l.organizations = idMap(orgs.data, (r) => r.name);
  l.sites = idMap(sites.data, (r) => r.name);
  l.assets = idMap(assets.data, (r) => r.name);
  l.inspectionAssets = idMap(inspections.data, (r) => r.asset_id);
  l.captureFiles = idMap(captures.data, (r) => r.file_name);
  l.findingTypeOf = idMap(findings.data, (r) => r.type_id);
  l.findingTypes = idMap(types.data, (r) => r.label_es);

  const missingAssets = [...new Set(l.inspectionAssets.values())].filter((a) => !l.assets.has(a));
  if (missingAssets.length) {
    const { data } = await sb.from("assets").select("id, name").in("id", missingAssets);
    for (const [id, name] of idMap(data, (r) => r.name)) l.assets.set(id, name);
  }
  return l;
}

/**
 * Una página del registro de cambios (más recientes primero). Usa la sesión del usuario: la RLS de `change_log`
 * es la autoridad (admin todo; personal solo proyectos que puede leer; cliente nada) y el alcance la refuerza.
 */
export async function loadActivityPage(sb: Client, scope: ActivityScope | null, filters: ActivityFilters): Promise<ActivityPage> {
  if (!scope) return { ok: false, message: FORBIDDEN };

  let ids: string[] | undefined;
  if (filters.q) {
    ids = await searchIds(sb, filters.q);
    if (ids.length === 0) return { ok: true, entries: [], nextCursor: null };
  }

  const base = sb.from("change_log").select("id, at, action, actor_id, table_name, row_id, project_id, old, new");
  const { data, error } = await applyActivityQuery(base, scope, filters, ids);
  if (error) return { ok: false, message: FAILED };

  const { rows, nextCursor } = paginate((data ?? []) as LogRow[]);
  if (rows.length === 0) return { ok: true, entries: [], nextCursor: null };
  const lookups = await loadLookups(sb, rows);
  if (!lookups) return { ok: false, message: FAILED };
  return { ok: true, entries: buildActivityEntries(rows, lookups), nextCursor };
}
