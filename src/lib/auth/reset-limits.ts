import { createRateLimiter } from "./rate-limit";

const HOUR = 60 * 60 * 1000;

function intEnv(name: string, fallback: number, min = 1): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/**
 * Recuperación de contraseña (en memoria, por instancia): 10 por hora por IP, tope GLOBAL por hora
 * (RESET_GLOBAL_LIMIT_PER_HOUR, 1000 por defecto; no se salta rotando IP ni correo) y 5 por hora por correo.
 * Trade-off del límite por correo: cualquiera puede agotar el cupo de un correo ajeno (el atacante gasta
 * antes su cupo de IP y el global) y bloquearle la recuperación una hora; no se evita del todo sin cuenta.
 */
export const resetByIp = createRateLimiter({ max: 10, windowMs: HOUR, maxKeys: 5000 });
export const resetGlobal = createRateLimiter({ max: intEnv("RESET_GLOBAL_LIMIT_PER_HOUR", 1000), windowMs: HOUR, maxKeys: 1 });
export const resetByEmail = createRateLimiter({ max: 5, windowMs: HOUR, maxKeys: 5000 });

/** «Reenviar acceso» (admin): un envío por usuario cada 5 minutos, además de la marca de Supabase. */
export const resendByUser = createRateLimiter({ max: 1, windowMs: 5 * 60 * 1000, maxKeys: 5000 });

/** Quita el puerto y normaliza: IPv4 tal cual; IPv6 agrupada por /64 (primeros 4 grupos tras expandir «::»). */
function normalizeIp(raw: string): string {
  let ip = raw;
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracket) ip = bracket[1]!;
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  if (!ip.includes(":")) return ip;
  const mapped = /^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1]!;
  const parts = ip.toLowerCase().split("::");
  if (parts.length > 2) return ip;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const groups = parts.length === 2 ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}

/**
 * IP del cliente según x-forwarded-for. Cada proxy de confianza AÑADE la IP que ve al final de la lista;
 * lo anterior lo controla el cliente. Con TRUSTED_PROXY_HOPS saltos de confianza (por defecto 1) se usa el
 * valor `hops` posiciones desde el final. Sin cabecera: una clave global «desconocida» (x-real-ip no se usa:
 * un cliente puede enviarlo). Se quita el puerto y las IPv6 se agrupan por /64.
 */
export function clientIp(h: { get(name: string): string | null }): string {
  const list = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return "desconocida";
  const hops = intEnv("TRUSTED_PROXY_HOPS", 1);
  return normalizeIp(list[Math.max(0, list.length - hops)] ?? "desconocida").slice(0, 64);
}
