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

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
