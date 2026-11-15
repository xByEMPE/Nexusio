import type { Pt, Region } from "@/lib/blade";
import { groupInt, type Size } from "./viewer-logic";

/** Lógica pura de daños del visor (formas, asas, otras caras, modelo 2D, formatos); probada con Vitest. */

export const MIN_POLYGON_POINTS = 3;
export const HANDLE_HIT_PX = 10;
export const FACES = ["LE", "PS", "TE", "SS"] as const;
export type Face = (typeof FACES)[number];

export const STATUS_LABEL = { detected: "Detectado (IA)", confirmed: "Confirmado", dismissed: "Descartado" } as const;
export type FindingStatus = keyof typeof STATUS_LABEL;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const norm = (p: Pt, size: Size): [number, number] => [round6(clamp01(p.x / size.w)), round6(clamp01(p.y / size.h))];

/** Vértices editables en px del original: el recuadro conserva sus 2 esquinas. */
export function regionPoints(region: Region, size: Size): Pt[] {
  return region.points.map(([x, y]) => ({ x: x * size.w, y: y * size.h }));
}

/** Contorno cerrado en px del original (el recuadro da sus 4 esquinas). */
export function regionOutline(region: Region, size: Size): Pt[] {
  const pts = regionPoints(region, size);
  if (region.type !== "box") return pts;
  const [a, b] = pts as [Pt, Pt];
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ];
}

/** Región normalizada (0–1) desde puntos en px del original; el recuadro queda como [mín, máx]. */
export function toRegion(type: Region["type"], pts: Pt[], size: Size): Region {
  if (type === "box") {
    const [a, b] = pts as [Pt, Pt];
    const lo = norm({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, size);
    const hi = norm({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, size);
    return { type: "box", points: [lo, hi] };
  }
  return { type: "polygon", points: pts.map((p) => norm(p, size)) };
}

/** Mueve el vértice `i` (en un recuadro, una de sus 2 esquinas) a `p` (px del original). */
export function moveVertex(region: Region, i: number, p: Pt, size: Size): Region {
  const pts = regionPoints(region, size);
  if (i < 0 || i >= pts.length) return region;
  pts[i] = p;
  return toRegion(region.type, pts, size);
}

/** Índice del asa más cercana a `p` (px de pantalla) dentro de `radius`; null si ninguna. */
export function nearestHandle(handles: Pt[], p: Pt, radius = HANDLE_HIT_PX): number | null {
  let best: number | null = null;
  let bestD = radius;
  handles.forEach((h, i) => {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function outlineArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Daño bajo el punto (px del original): si hay varios, el de menor área (el más pequeño queda encima). */
export function hitFinding(list: { id: string; region: Region | null }[], p: Pt, size: Size): string | null {
  let best: { id: string; area: number } | null = null;
  for (const f of list) {
    if (!f.region) continue;
    const poly = regionOutline(f.region, size);
    if (!pointInPolygon(p, poly)) continue;
    const area = outlineArea(poly);
    if (!best || area < best.area) best = { id: f.id, area };
  }
  return best?.id ?? null;
}

type FacePhoto = { id: string; blade: string | null; face: string | null; radius_center_m: number | null };

/**
 * Para cada otra cara de la misma pala, la foto con `min |radio − r_actual|`.
 * Sin pala, cara o radio en la foto actual no hay comparación posible (lista vacía).
 */
export function closestByFace<T extends FacePhoto>(photos: T[], current: FacePhoto): { face: Face; photo: T }[] {
  const r = current.radius_center_m;
  if (!current.blade || !current.face || r == null) return [];
  const out: { face: Face; photo: T }[] = [];
  for (const face of FACES) {
    if (face === current.face) continue;
    let best: T | null = null;
    for (const p of photos) {
      if (p.blade !== current.blade || p.face !== face || p.radius_center_m == null) continue;
      if (!best || Math.abs(p.radius_center_m - r) < Math.abs(best.radius_center_m! - r)) best = p;
    }
    if (best) out.push({ face, photo: best });
  }
  return out;
}

/** Posición vertical en el modelo 2D: `y(r) = y_root − (r/L)·(y_root − y_tip)`, con r limitado a [0, L]. */
export function bladeY(r: number, L: number, yRoot: number, yTip: number): number {
  if (!(L > 0)) return yRoot;
  const t = Math.min(1, Math.max(0, r / L));
  return yRoot - t * (yRoot - yTip);
}

/** Largo de pala para el modelo: el de la inspección o, si falta, el mayor radio conocido. */
export function modelLength(bladeLengthM: number | null, radii: (number | null)[]): number | null {
  if (bladeLengthM != null && bladeLengthM > 0) return bladeLengthM;
  const known = radii.filter((r): r is number => r != null && r > 0);
  return known.length ? Math.max(...known) : null;
}

// --- Formatos ------------------------------------------------------------------------------------

export const fmtMm = (n: number | null): string => (n == null ? "—" : `${groupInt(n)} mm`);
export const fmtArea = (n: number | null): string => (n == null ? "—" : `${groupInt(n)} mm²`);
export const fmtRadius = (m: number | null): string => (m == null ? "—" : `${m.toFixed(2)} m`);
export const fmtGsd = (g: number | null): string => (g == null ? "—" : `${g.toFixed(3)} mm/px`);

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { dateStyle: "medium" });
}

// --- Comentarios ---------------------------------------------------------------------------------

export type Me = { id: string; isAdmin: boolean };

export const canEditComment = (c: { author_id: string }, me: Me, canComment: boolean): boolean => canComment && c.author_id === me.id;
/** El autor borra el suyo; el admin, cualquiera. */
export const canDeleteComment = (c: { author_id: string }, me: Me, canComment: boolean): boolean =>
  me.isAdmin || (canComment && c.author_id === me.id);

// --- Historial -----------------------------------------------------------------------------------

const FIELD_LABEL: Record<string, string> = {
  type_id: "Tipo",
  severity: "Severidad",
  status: "Estado",
  region: "Región",
  notes: "Notas",
  width_mm: "Ancho",
  length_mm: "Largo",
  area_mm2: "Área",
  radius_m: "Radio",
  gsd_mm_px_used: "GSD usado",
  client_reviewed_at: "Revisión del cliente",
};

/** Campos del daño que muestra el historial (el resto de cada fila de `change_log` no viaja al navegador). */
export const HISTORY_FIELDS = Object.keys(FIELD_LABEL);

/** Reduce una fila `old`/`new` de `change_log` a los campos del historial; la región solo como «cambió». */
export function pickHistoryFields(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const src = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of HISTORY_FIELDS) if (k in src) out[k] = k === "region" ? true : src[k];
  return out;
}

type JsonRecord = Record<string, unknown> | null;

function valueText(field: string, v: unknown, typeLabels: Record<string, string>): string {
  if (v == null || v === "") return "—";
  switch (field) {
    case "type_id":
      return typeLabels[String(v)] ?? "otro tipo";
    case "severity":
      return `Cat ${v}`;
    case "status":
      return STATUS_LABEL[v as FindingStatus] ?? String(v);
    case "region":
      return "modificada";
    case "width_mm":
    case "length_mm":
      return fmtMm(Number(v));
    case "area_mm2":
      return fmtArea(Number(v));
    case "radius_m":
      return fmtRadius(Number(v));
    case "gsd_mm_px_used":
      return fmtGsd(Number(v));
    case "client_reviewed_at":
      return fmtDateTime(String(v));
    default:
      return String(v);
  }
}

/** Líneas legibles de una fila de `change_log` de un daño (solo los campos con etiqueta). */
export function historyLines(action: string, oldRow: JsonRecord, newRow: JsonRecord, typeLabels: Record<string, string>): string[] {
  if (action === "insert") {
    const n = newRow ?? {};
    return [`Creado: ${valueText("type_id", n.type_id, typeLabels)} · ${valueText("severity", n.severity, typeLabels)} · ${valueText("status", n.status, typeLabels)}`];
  }
  if (action === "delete") return ["Eliminado"];
  const o = oldRow ?? {};
  const n = newRow ?? {};
  const lines: string[] = [];
  for (const field of Object.keys(FIELD_LABEL)) {
    if (!(field in n) && !(field in o)) continue;
    if (field === "region") {
      lines.push("Región: vértices movidos");
      continue;
    }
    lines.push(`${FIELD_LABEL[field]}: ${valueText(field, o[field], typeLabels)} → ${valueText(field, n[field], typeLabels)}`);
  }
  return lines;
}
