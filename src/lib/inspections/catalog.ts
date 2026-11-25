/**
 * Catálogo NEXUS de parques eólicos: reglas puras (sin base de datos ni «server-only», para usarlas también en el
 * navegador). El catálogo son los sitios `wind_farm` de la organización cuyo identificador (slug) es
 * `CATALOG_ORG_SLUG` (por defecto «nexus-01»).
 */

import { normalizeName } from "@/lib/inspections/field-project-rules";

export const DEFAULT_CATALOG_ORG_SLUG = "nexus-01";

/** Identificador de la organización dueña del catálogo (variable de entorno `CATALOG_ORG_SLUG`; solo servidor). */
export function catalogOrgSlug(env: Record<string, string | undefined> = process.env): string {
  const v = env.CATALOG_ORG_SLUG?.trim();
  return v ? v : DEFAULT_CATALOG_ORG_SLUG;
}

/** Máximo de máquinas que devuelve la carga de un parque (igual que MAX_FIELD_TURBINES; el mayor del catálogo tiene 142). */
export const MAX_CATALOG_MACHINES = 300;
/** Máximo de resultados que muestra el buscador de parques. */
export const MAX_SITE_SEARCH_RESULTS = 50;

export type PickerSite = {
  id: string;
  name: string;
  organization_id: string;
  state?: string | null;
  city?: string | null;
  /** Número de máquinas del parque (si se conoce). */
  machines?: number;
};

/** Etiqueta «Nombre · Estado · Municipio» (omite lo que falte). */
export function siteLabel(s: { name: string; state?: string | null; city?: string | null }): string {
  return [s.name, s.state, s.city].filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

/**
 * Filtra parques por nombre, estado o municipio (sin distinguir mayúsculas ni acentos; cada palabra de la búsqueda
 * debe aparecer en alguno de esos campos). Los nombres que empiezan con la búsqueda van primero. Sin búsqueda
 * devuelve los primeros por orden alfabético. `total` = coincidencias antes de recortar al límite.
 */
export function searchSites<T extends { name: string; state?: string | null; city?: string | null }>(
  sites: T[],
  query: string,
  limit = MAX_SITE_SEARCH_RESULTS,
): { items: T[]; total: number } {
  const words = normalizeName(query).split(" ").filter(Boolean);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "es");
  if (words.length === 0) return { items: [...sites].sort(byName).slice(0, limit), total: sites.length };
  const q = words.join(" ");
  const scored: { site: T; starts: boolean }[] = [];
  for (const site of sites) {
    const hay = normalizeName(siteLabel(site));
    if (words.every((w) => hay.includes(w))) scored.push({ site, starts: normalizeName(site.name).startsWith(q) });
  }
  scored.sort((a, b) => Number(b.starts) - Number(a.starts) || byName(a.site, b.site));
  return { items: scored.slice(0, limit).map((x) => x.site), total: scored.length };
}

export function filterSites<T extends { name: string; state?: string | null; city?: string | null }>(
  sites: T[],
  query: string,
  limit = MAX_SITE_SEARCH_RESULTS,
): T[] {
  return searchSites(sites, query, limit).items;
}

export const NEW_SITE_VALUE = "__new__";

/**
 * Cómo se envía el parque elegido en el asistente: «catalog» si es del catálogo (también con organización nueva; el
 * servidor lo copia), «existing» si es un parque propio de una organización existente (o el catálogo visto desde su
 * propia organización) y «new» en cualquier otro caso (hay que escribir el parque).
 */
export function decideSiteSelection(args: {
  orgChoice: string;
  orgIsNew: boolean;
  siteChoice: string;
  sites: { id: string; organization_id: string }[];
  catalogOrgId: string | null;
}): "new" | "existing" | "catalog" {
  const picked = args.siteChoice === NEW_SITE_VALUE ? undefined : args.sites.find((s) => s.id === args.siteChoice);
  if (!picked) return "new";
  const inCatalog = args.catalogOrgId !== null && picked.organization_id === args.catalogOrgId;
  if (!args.orgIsNew && picked.organization_id === args.orgChoice) return "existing";
  return inCatalog ? "catalog" : "new";
}

/**
 * Lista de turbinas al cargar las máquinas de un parque: si el texto actual está vacío o es una precarga previa sin
 * tocar, se reemplaza; si el usuario escribió líneas, se conservan y se añaden las del parque cuyo nombre no esté ya.
 */
export function mergeMachineLines(
  current: string,
  machines: { name: string; code?: string | null }[],
  replace: boolean,
): string {
  if (replace || current.trim() === "") return turbineListText(machines);
  const have = new Set(
    current
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"))
      .map((l) => l.split("|")[0]!.trim()),
  );
  const extra = turbineListText(machines.filter((m) => !have.has(m.name)));
  if (extra === "") return current;
  return `${current.replace(/\s+$/, "")}\n${extra}`;
}

export type CatalogMachine = {
  name: string;
  code: string | null;
  manufacturer: string | null;
  model: string | null;
  hub_height_m: number | null;
};

/** Orden natural por nombre («WTG 2» antes que «WTG 10»). */
export const compareMachines = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" });

/** Línea de la lista de turbinas: «WTG 01 | WTG01» (el código es opcional). */
export function machineLine(m: { name: string; code?: string | null }): string {
  return m.code ? `${m.name} | ${m.code}` : m.name;
}

/** Texto para precargar la lista de turbinas con las máquinas dadas (una por línea, en orden natural). */
export function turbineListText(machines: { name: string; code?: string | null }[]): string {
  return [...machines].sort(compareMachines).map(machineLine).join("\n");
}

/** Modelos distintos del parque («fabricante modelo»), con cuántas máquinas tiene cada uno, de más a menos. */
export function summarizeModels(machines: Pick<CatalogMachine, "manufacturer" | "model">[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of machines) {
    const label = [m.manufacturer, m.model].filter(Boolean).join(" ").trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

/** Alturas de buje distintas (ordenadas), solo informativas. */
export function hubHeights(machines: Pick<CatalogMachine, "hub_height_m">[]): number[] {
  return [...new Set(machines.map((m) => m.hub_height_m).filter((h): h is number => h != null))].sort((a, b) => a - b);
}

/** Resumen en una línea de las especificaciones de un parque (p. ej. «2 modelos: Vestas V136 (6), Goldwind GW (27) · buje 82 m»). */
export function describeSpecs(machines: Pick<CatalogMachine, "manufacturer" | "model" | "hub_height_m">[]): string {
  const models = summarizeModels(machines);
  const heights = hubHeights(machines);
  const parts: string[] = [];
  if (models.length === 1) parts.push(`${models[0]!.label} (${models[0]!.count})`);
  else if (models.length > 1) parts.push(`${models.length} modelos: ${models.map((m) => `${m.label} (${m.count})`).join(", ")}`);
  if (heights.length > 0) parts.push(`buje ${heights.join(" / ")} m`);
  return parts.join(" · ");
}
