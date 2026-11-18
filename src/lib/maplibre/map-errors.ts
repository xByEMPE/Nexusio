const FATAL = /worker failed to load|webgl/i;

/**
 * Decide si un evento "error" de MapLibre impide arrancar el mapa. Lista blanca: solo es fatal
 * el worker que no carga o un fallo de WebGL, y solo antes del evento `load`. Todo lo demás
 * (tiles, capas de estilo, source layers inexistentes...) se registra pero no toca el mapa.
 */
export function isFatalMapError(event: unknown, state: { loaded?: boolean } = {}): boolean {
  if (state.loaded) return false;
  if (typeof event !== "object" || event === null) return false;
  const e = event as { sourceId?: unknown; tile?: unknown; error?: unknown };
  if (e.sourceId != null || e.tile != null) return false;
  const msg = e.error instanceof Error ? e.error.message : typeof e.error === "string" ? e.error : "";
  return FATAL.test(msg);
}

/** Detalle técnico breve (máx. 200 caracteres) para mostrar al usuario o a soporte. */
export function mapErrorDetail(error: unknown): string {
  let msg: string | null = null;
  if (typeof error === "string") msg = error;
  else if (error instanceof Error) msg = error.message;
  else if (typeof error === "object" && error !== null && "error" in error) return mapErrorDetail((error as { error: unknown }).error);
  const text = (msg ?? "").trim();
  return text ? text.slice(0, 200) : "Error desconocido";
}
