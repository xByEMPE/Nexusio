/**
 * Decide si un evento "error" de MapLibre impide arrancar el mapa. Los errores de tiles, fuentes o
 * recursos sueltos (con sourceId, tile, o estado/URL HTTP) no deben tapar el mapa; los demás
 * (worker que no carga, falta de WebGL) sí son fatales.
 */
export function isFatalMapError(event: unknown): boolean {
  if (typeof event !== "object" || event === null) return true;
  const e = event as { sourceId?: unknown; tile?: unknown; error?: unknown };
  if (e.sourceId != null || e.tile != null) return false;
  if (typeof e.error === "object" && e.error !== null) {
    const inner = e.error as { status?: unknown; url?: unknown };
    if (inner.status != null || inner.url != null) return false;
  }
  return true;
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
