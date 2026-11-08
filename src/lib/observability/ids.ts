const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Trace ID de 128 bits compatible con W3C Trace Context. */
export function newTraceId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes);
}

/** Span ID de 64 bits compatible con W3C Trace Context. */
export function newSpanId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes);
}

/** Extrae el trace-id de una cabecera `traceparent` válida, o null. */
export function traceIdFromHeader(traceparent: string | null): string | null {
  if (!traceparent) return null;
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(traceparent.trim());
  return match?.[1] ?? null;
}

export function buildTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}
