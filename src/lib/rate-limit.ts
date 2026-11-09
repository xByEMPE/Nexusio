/**
 * Limitador de ventana deslizante en memoria. Suficiente para una instancia;
 * en despliegues con múltiples réplicas reemplazar por Upstash Redis o por
 * la tabla `public.rate_limits` con una función SQL atómica.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return function check(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const since = now - windowMs;
    const list = (hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= limit) {
      hits.set(key, list);
      return { allowed: false, retryAfterMs: (list[0] ?? now) + windowMs - now };
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if ((v.at(-1) ?? 0) < since) hits.delete(k);
    }
    return { allowed: true, retryAfterMs: 0 };
  };
}

/** Cabeceras de CDN/proxy que traen la IP del visitante, en orden de confianza. */
const IP_HEADERS = ["cf-connecting-ip", "true-client-ip", "x-client-ip", "x-real-ip", "x-forwarded-for"] as const;

export interface ClientIp {
  /** IP del visitante, o `null` si ninguna cabecera la trae. */
  readonly ip: string | null;
  /** Cabecera de donde salió, para diagnóstico en los logs. */
  readonly source: string | null;
}

/**
 * IP del visitante. Detrás de la CDN de Hostinger puede no llegar ninguna
 * cabecera; en ese caso devuelve `null` y quien llama debe evitar agrupar a
 * todos los visitantes bajo una misma clave.
 */
export function clientIpInfo(headers: Headers): ClientIp {
  for (const h of IP_HEADERS) {
    const v = headers.get(h)?.split(",")[0]?.trim();
    if (v) return { ip: v, source: h };
  }
  return { ip: null, source: null };
}

export function clientIp(headers: Headers): string {
  return clientIpInfo(headers).ip ?? "unknown";
}
