/**
 * Origen PÚBLICO de la petición (p. ej. https://nexusio.com.mx).
 *
 * Detrás del proxy de Hostinger el proceso Node escucha en 0.0.0.0:3000 y
 * `request.nextUrl.origin` refleja esa dirección interna, que nunca debe llegar al
 * navegador en una cabecera Location. Prioridad:
 *   1. SITE_URL (misma convención que src/lib/seo.ts), si es una URL http(s) válida.
 *   2. x-forwarded-host + x-forwarded-proto (primer valor, host validado).
 *   3. host + x-forwarded-proto (o el protocolo de nextUrl).
 *   4. request.nextUrl.origin (último recurso).
 * Nunca usa el parámetro `next` ni hosts con formato dudoso (evita inyección de host).
 */
type OriginRequest = {
  headers: { get(name: string): string | null };
  nextUrl: { origin: string; protocol?: string };
};

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOSTNAME_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`, "i");
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_RE = /^\[[0-9a-f:]+\]$/i;
const UNROUTABLE = new Set(["0.0.0.0", "[::]", "[::0]", "[0:0:0:0:0:0:0:0]"]);

function firstValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

/** Devuelve "host" o "host:puerto" normalizado, o null si no es un host público válido. */
function validHost(raw: string): string | null {
  if (!raw || raw.length > 255) return null;
  let host = raw;
  let port = "";
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end === -1) return null;
    host = raw.slice(0, end + 1);
    const rest = raw.slice(end + 1);
    if (rest) {
      if (!rest.startsWith(":")) return null;
      port = rest.slice(1);
      if (!port) return null;
    }
  } else {
    const idx = raw.lastIndexOf(":");
    if (idx !== -1) {
      host = raw.slice(0, idx);
      port = raw.slice(idx + 1);
      if (!port) return null;
    }
  }
  if (port && (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)) return null;
  const lower = host.toLowerCase();
  if (UNROUTABLE.has(lower)) return null;
  const ok = IPV6_RE.test(lower) || (IPV4_RE.test(lower) && lower.split(".").every((o) => Number(o) <= 255)) || HOSTNAME_RE.test(lower);
  if (!ok) return null;
  return port ? `${lower}:${port}` : lower;
}

function validProto(raw: string): "http" | "https" | null {
  const p = raw.toLowerCase();
  return p === "http" || p === "https" ? p : null;
}

function siteUrlOrigin(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * En producción, detrás del proxy el servidor ve http aunque el sitio público sea https: sin
 * `x-forwarded-proto` la redirección saldría a http. Se fuerza https salvo en localhost/127.0.0.1.
 */
function secureProto(proto: "http" | "https", host: string): "http" | "https" {
  if (process.env.NODE_ENV !== "production") return proto;
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" ? proto : "https";
}

export function publicOrigin(request: OriginRequest): string {
  const configured = siteUrlOrigin();
  if (configured) return configured;

  const fallbackProto = validProto((request.nextUrl.protocol ?? "").replace(/:$/, "")) ?? "https";
  const proto = validProto(firstValue(request.headers.get("x-forwarded-proto"))) ?? fallbackProto;

  const forwarded = validHost(firstValue(request.headers.get("x-forwarded-host")));
  if (forwarded) return `${secureProto(proto, forwarded)}://${forwarded}`;

  const host = validHost(firstValue(request.headers.get("host")));
  if (host) return `${secureProto(proto, host)}://${host}`;

  return request.nextUrl.origin;
}
