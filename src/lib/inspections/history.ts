/** Historial de daños (`change_log`): qué campos se muestran. Lo usan la acción del servidor y el visor. */

/** Campos del daño que muestra el historial y su etiqueta. */
export const HISTORY_FIELD_LABEL: Record<string, string> = {
  type_id: "Tipo",
  severity: "Severidad",
  status: "Estado",
  region: "Región",
  notes: "Notas",
  width_mm: "Transversal",
  length_mm: "Longitudinal",
  area_mm2: "Área",
  radius_m: "Radio",
  gsd_mm_px_used: "GSD usado",
  client_reviewed_at: "Revisión del cliente",
};

/** Campos del daño que muestra el historial (el resto de cada fila de `change_log` no viaja al navegador). */
export const HISTORY_FIELDS = Object.keys(HISTORY_FIELD_LABEL);

/** Reduce una fila `old`/`new` de `change_log` a los campos del historial; la región solo como «cambió». */
export function pickHistoryFields(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const src = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of HISTORY_FIELDS) if (k in src) out[k] = k === "region" ? true : src[k];
  return out;
}

/** Reduce una fila `old`/`new` de `change_log` a una lista blanca de columnas (lo demás nunca sale del servidor). */
export function pickAllowedFields(row: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const src = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of allowed) if (k in src) out[k] = src[k];
  return out;
}
