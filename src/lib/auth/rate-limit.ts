/**
 * Limitador de tasa en memoria (ventana deslizante por clave). Es por instancia del servidor: sirve
 * de freno contra abuso simple, no como garantía global (Supabase aplica además sus propios límites).
 *
 * La tabla está acotada (`maxKeys`). Cuando se llena, solo se limpian entradas ya expiradas; si siguen
 * todas vivas, las claves NUEVAS se rechazan en vez de expulsar entradas vivas: así el desalojo nunca
 * reinicia el límite de una clave agotada.
 */
export type RateLimiter = {
  /** Registra un intento; devuelve false si la clave ya agotó su cupo en la ventana (o la tabla está llena de claves nuevas). */
  hit(key: string): boolean;
  size(): number;
};

export function createRateLimiter(opts: { max: number; windowMs: number; maxKeys: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();

  const dropExpired = (t: number) => {
    for (const [k, list] of hits) {
      if (list.every((x) => t - x >= opts.windowMs)) hits.delete(k);
    }
  };

  return {
    hit(key) {
      const t = now();
      const known = hits.get(key);
      if (!known && hits.size >= opts.maxKeys) {
        dropExpired(t);
        if (hits.size >= opts.maxKeys) return false;
      }
      const list = (known ?? []).filter((x) => t - x < opts.windowMs);
      if (list.length >= opts.max) {
        hits.set(key, list);
        return false;
      }
      list.push(t);
      hits.set(key, list);
      return true;
    },
    size: () => hits.size,
  };
}
