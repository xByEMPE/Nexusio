/**
 * Registro de cambios (`change_log`): lógica pura del panel /admin/inspecciones/cambios.
 * Filtros, consulta, autorización y formato legible. Nada aquí toca la red: lo prueba vitest.
 * Solo se muestran columnas de una lista blanca por tabla (nunca correos, tokens ni hashes).
 */
import { HISTORY_FIELD_LABEL, pickAllowedFields } from "./history";
import { ASSET_KIND_LABEL, INSPECTION_STATUS_LABEL, PROJECT_STATUS_LABEL, SITE_KIND_LABEL } from "./labels";

export const PAGE_SIZE = 50;

/** Zona de las fechas del filtro: la operación es de México (UTC-6 fijo desde 2022). */
export const FILTER_UTC_OFFSET = "-06:00";

// ---------------------------------------------------------------------------------------------------------------
// Autorización
// ---------------------------------------------------------------------------------------------------------------
export type ActivityScope = "all" | "projects";

/**
 * Qué parte del registro puede pedir cada rol: el admin todo (incluidos los eventos globales); el técnico solo
 * lo de proyectos que puede leer (la RLS lo vuelve a aplicar); servicio y clientes nada.
 */
export function activityScope(platformRole: string | null | undefined): ActivityScope | null {
  if (platformRole === "admin") return "all";
  if (platformRole === "technician") return "projects";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Entidades, acciones
// ---------------------------------------------------------------------------------------------------------------
export const ENTITY_GROUPS = [
  { key: "project", label: "Proyecto", tables: ["projects"] },
  { key: "site", label: "Sitio", tables: ["sites"] },
  { key: "asset", label: "Activo", tables: ["assets", "wind_turbine_specs"] },
  { key: "inspection", label: "Inspección", tables: ["inspections"] },
  { key: "photo", label: "Foto", tables: ["captures", "blade_captures"] },
  { key: "strip", label: "Tira", tables: ["mosaics"] },
  { key: "finding", label: "Daño", tables: ["findings"] },
  { key: "finding_type", label: "Tipo de daño", tables: ["finding_types"] },
  { key: "comment", label: "Comentario", tables: ["comments"] },
  { key: "user", label: "Usuario", tables: ["profiles"] },
  { key: "organization", label: "Organización", tables: ["organizations"] },
  { key: "membership", label: "Miembro de organización", tables: ["organization_members"] },
  { key: "assignment", label: "Asignación a proyecto", tables: ["project_assignments"] },
  { key: "project_site", label: "Sitio del proyecto", tables: ["project_sites"] },
] as const;

export type EntityKey = (typeof ENTITY_GROUPS)[number]["key"];
const ENTITY_KEYS = new Set<string>(ENTITY_GROUPS.map((g) => g.key));
const ENTITY_BY_TABLE = new Map<string, string>(ENTITY_GROUPS.flatMap((g) => g.tables.map((t) => [t, g.label] as const)));

export const ACTIONS = ["insert", "update", "delete"] as const;
export type ActivityAction = (typeof ACTIONS)[number];
export const ACTION_LABEL: Record<ActivityAction, string> = { insert: "Creó", update: "Modificó", delete: "Eliminó" };

export function entityLabel(table: string): string {
  return ENTITY_BY_TABLE.get(table) ?? "Otro";
}

// ---------------------------------------------------------------------------------------------------------------
// Filtros (parámetros de la URL)
// ---------------------------------------------------------------------------------------------------------------
export type ActivityFilters = {
  actor?: string;
  entity?: EntityKey;
  action?: ActivityAction;
  project?: string;
  from?: string;
  to?: string;
  q?: string;
  cursor?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function validDay(v: string | undefined): string | undefined {
  if (!v || !DAY.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

/** Texto de búsqueda seguro: solo letras, números, espacios y . _ - (sin comodines ni separadores de filtro). */
export function sanitizeSearch(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return s.length >= 2 ? s : undefined;
}

/** Lee `searchParams`; todo valor inválido se ignora (nunca llega a la consulta). */
export function parseActivityFilters(sp: Record<string, string | string[] | undefined>): ActivityFilters {
  const out: ActivityFilters = {};
  const actor = first(sp.usuario);
  if (actor && UUID.test(actor)) out.actor = actor;
  const entity = first(sp.entidad);
  if (entity && ENTITY_KEYS.has(entity)) out.entity = entity as EntityKey;
  const action = first(sp.accion);
  if (action && (ACTIONS as readonly string[]).includes(action)) out.action = action as ActivityAction;
  const project = first(sp.proyecto);
  if (project && UUID.test(project)) out.project = project;
  const from = validDay(first(sp.desde));
  const to = validDay(first(sp.hasta));
  if (from) out.from = from;
  if (to) out.to = to;
  const q = sanitizeSearch(first(sp.q));
  if (q) out.q = q;
  const cursor = first(sp.cursor);
  if (cursor && /^\d{1,15}$/.test(cursor) && Number(cursor) > 0) out.cursor = Number(cursor);
  return out;
}

/** Parámetros de URL de unos filtros (para conservar los filtros al paginar). */
export function filtersToParams(f: ActivityFilters, cursor?: number): URLSearchParams {
  const p = new URLSearchParams();
  if (f.actor) p.set("usuario", f.actor);
  if (f.entity) p.set("entidad", f.entity);
  if (f.action) p.set("accion", f.action);
  if (f.project) p.set("proyecto", f.project);
  if (f.from) p.set("desde", f.from);
  if (f.to) p.set("hasta", f.to);
  if (f.q) p.set("q", f.q);
  if (cursor) p.set("cursor", String(cursor));
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Consulta (paginación por cursor sobre id desc)
// ---------------------------------------------------------------------------------------------------------------
/** Lo mínimo del constructor de consultas de Supabase que usa el panel (permite probarlo con un doble). */
export type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  neq(column: string, value: unknown): FilterQuery;
  in(column: string, values: unknown[]): FilterQuery;
  not(column: string, operator: string, value: unknown): FilterQuery;
  gte(column: string, value: unknown): FilterQuery;
  lte(column: string, value: unknown): FilterQuery;
  lt(column: string, value: unknown): FilterQuery;
  or(filters: string): FilterQuery;
  order(column: string, opts: { ascending: boolean }): FilterQuery;
  limit(n: number): FilterQuery;
};

export function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00.000${FILTER_UTC_OFFSET}`).toISOString();
}
export function dayEndIso(day: string): string {
  return new Date(`${day}T23:59:59.999${FILTER_UTC_OFFSET}`).toISOString();
}

export function tablesForEntity(entity: EntityKey): readonly string[] {
  return ENTITY_GROUPS.find((g) => g.key === entity)!.tables;
}

/** Filtro `or` de PostgREST para la búsqueda: filas cuyo objeto, proyecto o autor sean alguno de los ids encontrados. */
export function searchOrFilter(ids: string[]): string {
  const list = ids.filter((i) => UUID.test(i)).join(",");
  return `row_id.in.(${list}),project_id.in.(${list}),actor_id.in.(${list})`;
}

/**
 * Aplica alcance, filtros, cursor, orden (id desc: estable) y límite (una fila de más para saber si hay otra página).
 * `searchIds` = ids que coinciden con la búsqueda de texto (vacío con `q` = la página queda vacía, lo resuelve el cargador).
 */
export function applyActivityQuery<T>(query: T, scope: ActivityScope, f: ActivityFilters, searchIds?: string[]): T {
  let q = query as unknown as FilterQuery;
  if (scope === "projects") {
    // Refuerzo de la RLS: el personal no ve eventos globales ni la gestión de usuarios
    q = q.not("project_id", "is", null).neq("table_name", "project_assignments");
  }
  if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.entity) q = q.in("table_name", [...tablesForEntity(f.entity)]);
  if (f.action) q = q.eq("action", f.action);
  if (f.project) q = q.eq("project_id", f.project);
  if (f.from) q = q.gte("at", dayStartIso(f.from));
  if (f.to) q = q.lte("at", dayEndIso(f.to));
  if (searchIds && searchIds.length > 0) q = q.or(searchOrFilter(searchIds));
  if (f.cursor) q = q.lt("id", f.cursor);
  q = q.order("id", { ascending: false }).limit(PAGE_SIZE + 1);
  return q as unknown as T;
}

/** Recorta la fila extra y calcula el cursor de la página siguiente (id de la última fila mostrada). */
export function paginate<T extends { id: number }>(rows: T[]): { rows: T[]; nextCursor: number | null } {
  if (rows.length <= PAGE_SIZE) return { rows, nextCursor: null };
  const page = rows.slice(0, PAGE_SIZE);
  return { rows: page, nextCursor: page[page.length - 1]!.id };
}

// ---------------------------------------------------------------------------------------------------------------
// Etiquetas de campos (lista blanca por tabla)
// ---------------------------------------------------------------------------------------------------------------
type Ref = "organization" | "site" | "user" | "findingType";
type FieldSpec = { label: string; map?: Record<string, string>; bool?: boolean; region?: boolean; ref?: Ref };

const BLADE_FACE: Record<string, string> = { LE: "Borde de ataque", TE: "Borde de salida", PS: "Lado de presión", SS: "Lado de succión" };
const FINDING_STATUS: Record<string, string> = { detected: "Detectado", confirmed: "Confirmado", dismissed: "Descartado" };
const PLATFORM_ROLE: Record<string, string> = { admin: "Administrador", technician: "Técnico", service: "Servicio" };
const MEMBER_ROLE: Record<string, string> = { client_manager: "Gerente", client_viewer: "Lector" };
const INSPECTION_KIND: Record<string, string> = { wind_blade: "Palas", solar: "Solar", transmission: "Transmisión" };

const FIELD_SPECS: Record<string, Record<string, FieldSpec>> = {
  projects: {
    organization_id: { label: "Organización", ref: "organization" },
    name: { label: "Nombre" },
    code: { label: "Código" },
    status: { label: "Estado", map: PROJECT_STATUS_LABEL },
    start_date: { label: "Inicio" },
    end_date: { label: "Fin" },
  },
  project_sites: { site_id: { label: "Sitio", ref: "site" } },
  project_assignments: { user_id: { label: "Persona", ref: "user" } },
  organizations: { name: { label: "Nombre" }, slug: { label: "Identificador" } },
  organization_members: {
    organization_id: { label: "Organización", ref: "organization" },
    user_id: { label: "Persona", ref: "user" },
    role: { label: "Rol", map: MEMBER_ROLE },
  },
  sites: {
    organization_id: { label: "Organización", ref: "organization" },
    kind: { label: "Tipo", map: SITE_KIND_LABEL },
    name: { label: "Nombre" },
    lat: { label: "Latitud" },
    lon: { label: "Longitud" },
  },
  assets: {
    organization_id: { label: "Organización", ref: "organization" },
    site_id: { label: "Sitio", ref: "site" },
    kind: { label: "Tipo", map: ASSET_KIND_LABEL },
    name: { label: "Nombre" },
    code: { label: "Código" },
    lat: { label: "Latitud" },
    lon: { label: "Longitud" },
  },
  wind_turbine_specs: {
    manufacturer: { label: "Fabricante" },
    model: { label: "Modelo" },
    blade_length_m: { label: "Largo de pala (m)" },
    rotor_diameter_m: { label: "Diámetro de rotor (m)" },
    hub_height_m: { label: "Altura de buje (m)" },
  },
  comments: { body: { label: "Texto" }, author_id: { label: "Autor", ref: "user" } },
  profiles: { platform_role: { label: "Rol", map: PLATFORM_ROLE }, is_active: { label: "Cuenta activa", bool: true } },
  finding_types: {
    domain: { label: "Dominio", map: INSPECTION_KIND },
    code: { label: "Código" },
    label_es: { label: "Nombre" },
    is_active: { label: "Activo", bool: true },
  },
  findings: Object.fromEntries(
    Object.entries(HISTORY_FIELD_LABEL).map(([k, label]): [string, FieldSpec] => [
      k,
      k === "type_id"
        ? { label, ref: "findingType" }
        : k === "status"
          ? { label, map: FINDING_STATUS }
          : k === "region"
            ? { label, region: true }
            : { label },
    ]),
  ),
  captures: {
    gsd_mm_px: { label: "GSD (mm/px)" },
    gsd_source: { label: "Origen del GSD" },
    gsd_confidence: { label: "Confianza del GSD" },
  },
  blade_captures: { radius_center_m: { label: "Radio al centro (m)" }, face: { label: "Cara", map: BLADE_FACE } },
  mosaics: {
    tip_row_px: { label: "Fila de la punta (px)" },
    root_row_px: { label: "Fila de la raíz (px)" },
    blade_length_m: { label: "Largo de pala (m)" },
    mm_per_px: { label: "mm por px" },
    root_at_top: { label: "Raíz arriba", bool: true },
  },
  inspections: { blade_length_m: { label: "Largo de pala (m)" }, status: { label: "Estado", map: INSPECTION_STATUS_LABEL } },
};

// ---------------------------------------------------------------------------------------------------------------
// Resolución de nombres y entradas legibles
// ---------------------------------------------------------------------------------------------------------------
export type LogRow = {
  id: number;
  at: string;
  action: string;
  actor_id: string | null;
  table_name: string;
  row_id: string;
  project_id: string | null;
  old: unknown;
  new: unknown;
};

export type ActivityLookups = {
  /** Perfiles existentes por id (nombre y rol; nunca el correo). */
  users: Map<string, { name: string | null; role: string | null }>;
  projects: Map<string, string>;
  organizations: Map<string, string>;
  sites: Map<string, string>;
  assets: Map<string, string>;
  findingTypes: Map<string, string>;
  /** inspection id -> asset id */
  inspectionAssets: Map<string, string>;
  /** capture id -> nombre de archivo */
  captureFiles: Map<string, string>;
  /** finding id -> type id */
  findingTypeOf: Map<string, string>;
};

export const emptyLookups = (): ActivityLookups => ({
  users: new Map(),
  projects: new Map(),
  organizations: new Map(),
  sites: new Map(),
  assets: new Map(),
  findingTypes: new Map(),
  inspectionAssets: new Map(),
  captureFiles: new Map(),
  findingTypeOf: new Map(),
});

export type ChangeLine = { label: string; before: string | null; after: string | null };

export type ActivityEntry = {
  id: number;
  at: string;
  action: ActivityAction;
  actionLabel: string;
  actor: { kind: "system" | "deleted" | "user"; name: string; role: string | null };
  entity: string;
  objectName: string | null;
  projectName: string | null;
  lines: ChangeLine[];
};

const DELETED_USER = "Usuario eliminado";
const NO_NAME = "Usuario sin nombre";

/** Ids que el formateo necesita buscar (una consulta por tipo y página, no una por fila). */
export function collectLookupIds(rows: LogRow[]): {
  users: string[];
  projects: string[];
  organizations: string[];
  sites: string[];
  assets: string[];
  inspections: string[];
  captures: string[];
  findings: string[];
} {
  const sets = {
    users: new Set<string>(),
    projects: new Set<string>(),
    organizations: new Set<string>(),
    sites: new Set<string>(),
    assets: new Set<string>(),
    inspections: new Set<string>(),
    captures: new Set<string>(),
    findings: new Set<string>(),
  };
  for (const r of rows) {
    if (r.actor_id) sets.users.add(r.actor_id);
    if (r.project_id) sets.projects.add(r.project_id);
    const t = r.table_name;
    if (t === "profiles" || t === "organization_members" || t === "project_assignments") sets.users.add(r.row_id);
    if (t === "projects") sets.projects.add(r.row_id);
    if (t === "organizations") sets.organizations.add(r.row_id);
    if (t === "sites") sets.sites.add(r.row_id);
    if (t === "assets" || t === "wind_turbine_specs") sets.assets.add(r.row_id);
    if (t === "inspections") sets.inspections.add(r.row_id);
    if (t === "captures" || t === "blade_captures") sets.captures.add(r.row_id);
    if (t === "findings") sets.findings.add(r.row_id);
    if (t === "project_sites") sets.sites.add(r.row_id);
    const spec = FIELD_SPECS[t] ?? {};
    for (const side of [r.old, r.new]) {
      const picked = pickAllowedFields(side, Object.keys(spec));
      if (!picked) continue;
      for (const [k, v] of Object.entries(picked)) {
        if (typeof v !== "string") continue;
        const ref = spec[k]?.ref;
        if (ref === "user") sets.users.add(v);
        else if (ref === "organization") sets.organizations.add(v);
        else if (ref === "site") sets.sites.add(v);
      }
    }
  }
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, [...v]])) as ReturnType<typeof collectLookupIds>;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function payloadString(r: LogRow, key: string): string | null {
  const o = pickAllowedFields(r.old, [key]);
  const n = pickAllowedFields(r.new, [key]);
  return str(n?.[key]) ?? str(o?.[key]);
}

function userName(id: string, l: ActivityLookups): string {
  const u = l.users.get(id);
  return u ? (u.name?.trim() || NO_NAME) : DELETED_USER;
}

function formatValue(spec: FieldSpec, value: unknown, l: ActivityLookups): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (spec.region) return "marcada";
  if (spec.bool) return value === true ? "Sí" : "No";
  if (typeof value === "string") {
    if (spec.map) return spec.map[value] ?? value;
    if (spec.ref === "user") return userName(value, l);
    if (spec.ref === "organization") return l.organizations.get(value) ?? "organización eliminada";
    if (spec.ref === "site") return l.sites.get(value) ?? "sitio eliminado";
    if (spec.ref === "findingType") return l.findingTypes.get(value) ?? "tipo eliminado";
    return value;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return null;
}

/** Líneas «campo: antes → después» solo de las columnas de la lista blanca de la tabla. */
export function summarizeChange(table: string, action: string, oldRow: unknown, newRow: unknown, l: ActivityLookups = emptyLookups()): ChangeLine[] {
  const spec = FIELD_SPECS[table];
  if (!spec) return [];
  const keys = Object.keys(spec);
  const o = pickAllowedFields(oldRow, keys);
  const n = pickAllowedFields(newRow, keys);
  const lines: ChangeLine[] = [];
  for (const key of keys) {
    const s = spec[key]!;
    const inOld = o ? key in o : false;
    const inNew = n ? key in n : false;
    if (!inOld && !inNew) continue;
    const before = inOld ? formatValue(s, o![key], l) : null;
    const after = inNew ? formatValue(s, n![key], l) : null;
    if (action === "insert") {
      if (after !== null) lines.push({ label: s.label, before: null, after });
    } else if (action === "delete") {
      if (before !== null) lines.push({ label: s.label, before, after: null });
    } else if (before !== after) {
      lines.push({ label: s.label, before, after });
    }
  }
  return lines;
}

/** Nombre del objeto afectado (p. ej. «WTG 25»): del propio evento si lo trae; si no, de las consultas de la página. */
export function objectName(r: LogRow, l: ActivityLookups): string | null {
  switch (r.table_name) {
    case "projects":
      return payloadString(r, "name") ?? l.projects.get(r.row_id) ?? null;
    case "sites":
      return payloadString(r, "name") ?? l.sites.get(r.row_id) ?? null;
    case "assets":
      return payloadString(r, "name") ?? l.assets.get(r.row_id) ?? null;
    case "organizations":
      return payloadString(r, "name") ?? l.organizations.get(r.row_id) ?? null;
    case "wind_turbine_specs":
      return l.assets.get(r.row_id) ?? null;
    case "inspections": {
      const asset = l.inspectionAssets.get(r.row_id);
      return asset ? (l.assets.get(asset) ?? null) : null;
    }
    case "captures":
    case "blade_captures":
      return l.captureFiles.get(r.row_id) ?? null;
    case "findings": {
      const typeId = payloadString(r, "type_id") ?? l.findingTypeOf.get(r.row_id);
      return typeId ? (l.findingTypes.get(typeId) ?? null) : null;
    }
    case "finding_types":
      return payloadString(r, "label_es") ?? l.findingTypes.get(r.row_id) ?? null;
    case "profiles":
    case "organization_members":
    case "project_assignments":
      return userName(r.row_id, l);
    case "project_sites":
      return l.sites.get(r.row_id) ?? null;
    default:
      return null;
  }
}

function actorOf(actorId: string | null, l: ActivityLookups): ActivityEntry["actor"] {
  if (!actorId) return { kind: "system", name: "Sistema / IA", role: null };
  const u = l.users.get(actorId);
  if (!u) return { kind: "deleted", name: DELETED_USER, role: null };
  return { kind: "user", name: u.name?.trim() || NO_NAME, role: u.role ? (PLATFORM_ROLE[u.role] ?? null) : "Cliente" };
}

export function buildActivityEntries(rows: LogRow[], l: ActivityLookups): ActivityEntry[] {
  return rows.map((r) => {
    const action = (ACTIONS as readonly string[]).includes(r.action) ? (r.action as ActivityAction) : "update";
    return {
      id: r.id,
      at: r.at,
      action,
      actionLabel: ACTION_LABEL[action],
      actor: actorOf(r.actor_id, l),
      entity: entityLabel(r.table_name),
      objectName: objectName(r, l),
      projectName: r.project_id ? (l.projects.get(r.project_id) ?? "Proyecto eliminado") : null,
      lines: summarizeChange(r.table_name, action, r.old, r.new, l),
    };
  });
}
