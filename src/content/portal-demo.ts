import type { AssetHealth, PortalAsset, PortalProject, PortalReport } from "@/contracts/platform";

/** Datos simulados del portal de clientes. Generación determinista para SSR/CSR estables. */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Layout = (i: number, n: number, r: () => number) => { x: number; y: number };

/** Aerogeneradores en dos filas escalonadas sobre una loma. */
const windLayout: Layout = (i, n, r) => {
  const row = i % 2;
  const col = Math.floor(i / 2);
  const cols = Math.ceil(n / 2);
  return { x: 0.1 + (col / (cols - 1)) * 0.8 + (r() - 0.5) * 0.02, y: 0.38 + row * 0.26 + (r() - 0.5) * 0.05 };
};

/** Torres a lo largo de una línea de transmisión con quiebres. */
const lineLayout: Layout = (i, n) => {
  const t = i / (n - 1);
  const x = 0.06 + t * 0.88;
  const y = 0.72 - t * 0.38 + Math.sin(t * Math.PI * 2.2) * 0.08;
  return { x, y };
};

/** Mesas de una planta fotovoltaica en grilla. */
const solarLayout: Layout = (i) => {
  const col = i % 8;
  const row = Math.floor(i / 8);
  return { x: 0.14 + col * 0.103, y: 0.26 + row * 0.16 };
};

function buildAssets(
  prefix: string,
  n: number,
  layout: Layout,
  seed: number,
  critical: number[],
  observed: number[],
): PortalAsset[] {
  const r = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const health: AssetHealth = critical.includes(i) ? "critical" : observed.includes(i) ? "observed" : "ok";
    const { x, y } = layout(i, n, r);
    const day = 3 + Math.floor(r() * 20);
    return {
      id: `${prefix}-${i + 1}`,
      code: `${prefix}-${String(i + 1).padStart(2, "0")}`,
      x,
      y,
      health,
      openFindings: health === "critical" ? 2 + Math.floor(r() * 2) : health === "observed" ? 1 + Math.floor(r() * 2) : 0,
      lastInspection: `${String(day).padStart(2, "0")}/10/2026`,
    };
  });
}

const countBy = (assets: PortalAsset[], h: AssetHealth) => assets.filter((a) => a.health === h).length;

const windAssets = buildAssets("AG", 24, windLayout, 3, [5, 17], [2, 9, 12, 20]);
const lineAssets = buildAssets("T", 18, lineLayout, 5, [11], [3, 7, 14]);
const solarAssets = buildAssets("M", 32, solarLayout, 9, [], [4, 13, 22, 27, 30]);

export const PORTAL_PROJECTS: PortalProject[] = [
  {
    id: "wind",
    name: "Parque eólico Los Cerros",
    site: "Oaxaca",
    assetLabel: "Aerogeneradores",
    assets: windAssets,
    progress: 0.75,
    lastFlight: "Hace 2 días",
    findingsBySeverity: { critical: countBy(windAssets, "critical") * 2, moderate: 6, minor: 9 },
  },
  {
    id: "line",
    name: "Línea 230 kV Norte",
    site: "Sonora",
    assetLabel: "Torres",
    assets: lineAssets,
    progress: 1,
    lastFlight: "Hace 6 días",
    findingsBySeverity: { critical: 2, moderate: 4, minor: 5 },
  },
  {
    id: "solar",
    name: "Planta fotovoltaica El Llano",
    site: "Coahuila",
    assetLabel: "Mesas",
    assets: solarAssets,
    progress: 0.4,
    lastFlight: "Ayer",
    findingsBySeverity: { critical: 0, moderate: 3, minor: 7 },
  },
];

export const PORTAL_REPORTS: PortalReport[] = [
  { id: "r1", title: "Inspección trimestral de palas · Q4", project: "Parque eólico Los Cerros", date: "06/11/2026", status: "in_review", pages: 48 },
  { id: "r2", title: "Inspección de torres y aisladores", project: "Línea 230 kV Norte", date: "02/11/2026", status: "published", pages: 36 },
  { id: "r3", title: "Termografía de módulos · Sector A", project: "Planta fotovoltaica El Llano", date: "07/11/2026", status: "draft", pages: 12 },
  { id: "r4", title: "Inspección trimestral de palas · Q3", project: "Parque eólico Los Cerros", date: "08/08/2026", status: "published", pages: 51 },
  { id: "r5", title: "Volumetría de acopios · Octubre", project: "Tajo Norte", date: "31/10/2026", status: "published", pages: 9 },
];
