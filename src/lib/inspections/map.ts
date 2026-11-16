import { SEVERITY_COLOR } from "./severity";

export type MapStatus = "pending" | "captured" | "processing" | "in_review" | "approved";

export const NO_INSPECTION_COLOR = "#64748B";
export const IN_PROGRESS_COLOR = "#3B82F6";
export const IN_REVIEW_COLOR = "#F59E0B";
export const APPROVED_CLEAN_COLOR = "#10B981";

/** Color del marcador según el estado de la inspección más reciente y la mayor severidad visible. */
export function turbineColor(status: MapStatus | null, maxSeverity: number | null): string {
  if (!status) return NO_INSPECTION_COLOR;
  if (status === "in_review") return IN_REVIEW_COLOR;
  if (status === "approved") return maxSeverity ? (SEVERITY_COLOR[maxSeverity] ?? APPROVED_CLEAN_COLOR) : APPROVED_CLEAN_COLOR;
  return IN_PROGRESS_COLOR;
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
