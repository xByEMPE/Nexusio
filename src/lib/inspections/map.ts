import { SEVERITY_COLOR } from "./severity";

export type MapStatus = "pending" | "captured" | "processing" | "in_review" | "approved";

export const NO_INSPECTION_COLOR = "#64748B";
export const IN_PROGRESS_COLOR = "#3B82F6";
/** Ámbar de «moderado» (Cat 3); la Cat 4 naranja también se pinta con él para que la leyenda sea simple. */
export const MODERATE_COLOR = SEVERITY_COLOR[3] ?? "#F59E0B";
export const CRITICAL_COLOR = SEVERITY_COLOR[5] ?? "#EF4444";
export const OK_COLOR = "#10B981";

/** Estado general de una turbina en el mapa (solo cuentan los daños confirmados). */
export type TurbineHealth = "critical" | "moderate" | "ok" | "in_progress" | "none";

/** Animación del marcador: parpadeo (crítico), pulso, pulso suave, pulso lento o estático. */
export type HealthAnim = "blink" | "pulse" | "soft" | "slow" | "none";

export const HEALTH_META: Record<
  TurbineHealth,
  { label: string; color: string; anim: HealthAnim; animClass: string; animLabel: string; spin: boolean }
> = {
  critical: { label: "Crítico", color: CRITICAL_COLOR, anim: "blink", animClass: "animate-signal-blink", animLabel: "Parpadeo", spin: true },
  moderate: { label: "Moderado", color: MODERATE_COLOR, anim: "pulse", animClass: "animate-signal-pulse", animLabel: "Pulso", spin: true },
  ok: { label: "Sin hallazgos críticos", color: OK_COLOR, anim: "soft", animClass: "animate-signal-pulse-soft", animLabel: "Pulso suave", spin: true },
  in_progress: { label: "En proceso", color: IN_PROGRESS_COLOR, anim: "slow", animClass: "animate-signal-pulse-slow", animLabel: "Pulso lento", spin: true },
  none: { label: "Sin inspección", color: NO_INSPECTION_COLOR, anim: "none", animClass: "", animLabel: "Estático", spin: false },
};

/** Orden de la leyenda, de más a menos urgente. */
export const HEALTH_ORDER: TurbineHealth[] = ["critical", "moderate", "ok", "in_progress", "none"];

type Counts = Partial<Record<number, number>>;

/**
 * Estado general: Cat 5 → crítico; Cat 3–4 → moderado; inspección aprobada o en revisión sin daños Cat ≥ 3 → ok;
 * inspección aún sin revisar (pendiente, capturada, procesando) → en proceso; sin inspección → none.
 */
export function turbineHealth(status: MapStatus | null, counts: Counts | null): TurbineHealth {
  if (!status) return "none";
  if ((counts?.[5] ?? 0) > 0) return "critical";
  if ((counts?.[3] ?? 0) > 0 || (counts?.[4] ?? 0) > 0) return "moderate";
  return status === "approved" || status === "in_review" ? "ok" : "in_progress";
}

/** Color del marcador según su estado general. */
export function turbineColor(status: MapStatus | null, counts: Counts | null): string {
  return HEALTH_META[turbineHealth(status, counts)].color;
}

/** Texto para lectores de pantalla, p. ej. «WTG 25: Crítico, categoría 5». */
export function turbineAriaLabel(name: string, health: TurbineHealth, maxSeverity: number | null): string {
  const base = `${name}: ${HEALTH_META[health].label}`;
  return (health === "critical" || health === "moderate") && maxSeverity ? `${base}, categoría ${maxSeverity}` : base;
}

const MIN_SPAN_DEG = 0.01;

/** Caja [[minLon,minLat],[maxLon,maxLat]]; un solo punto (o puntos casi iguales) recibe un margen mínimo. */
export function boundsOf(points: { lat: number; lon: number }[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const p of points) {
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }
  if (maxLon - minLon < MIN_SPAN_DEG) {
    const c = (minLon + maxLon) / 2;
    minLon = c - MIN_SPAN_DEG / 2;
    maxLon = c + MIN_SPAN_DEG / 2;
  }
  if (maxLat - minLat < MIN_SPAN_DEG) {
    const c = (minLat + maxLat) / 2;
    minLat = c - MIN_SPAN_DEG / 2;
    maxLat = c + MIN_SPAN_DEG / 2;
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

type InspectionPos = { asset_id: string; created_at: string; asset_lat: number | null; asset_lon: number | null };

/**
 * Posición de la inspección más reciente con posición, por activo (§9.1). Sirve para la acción
 * «Usar posición de la última inspección» del admin: solo se ofrece si el activo no tiene `lat/lon`.
 */
export function latestInspectionPositions(rows: InspectionPos[]): Map<string, { lat: number; lon: number }> {
  const best = new Map<string, { at: string; lat: number; lon: number }>();
  for (const r of rows) {
    if (r.asset_lat == null || r.asset_lon == null) continue;
    const cur = best.get(r.asset_id);
    if (!cur || r.created_at > cur.at) best.set(r.asset_id, { at: r.created_at, lat: r.asset_lat, lon: r.asset_lon });
  }
  return new Map([...best].map(([id, b]) => [id, { lat: b.lat, lon: b.lon }]));
}

/** Si al activo le falta posición propia y hay una de inspección para copiar. */
export function canUseInspectionPosition(asset: { lat: number | null; lon: number | null }, fromInspection: { lat: number; lon: number } | undefined): boolean {
  return (asset.lat == null || asset.lon == null) && fromInspection != null;
}
