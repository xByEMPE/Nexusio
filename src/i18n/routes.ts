import type { Locale } from "./config";

/** Pares de slug de las páginas de servicio (mismo servicio en cada idioma). */
export const SERVICE_SLUGS = [
  { id: "dji_apps", es: "apps-para-drones-dji", en: "dji-drone-app-development" },
  { id: "platforms", es: "plataforma-inspeccion-drones", en: "drone-inspection-software" },
  { id: "web", es: "desarrollo-web", en: "web-development" },
] as const;

export const SERVICES_BASE: Record<Locale, string> = { es: "/servicios", en: "/en/services" };

export function servicePath(locale: Locale, slug: string): string {
  return `${SERVICES_BASE[locale]}/${slug}`;
}

/**
 * Ruta equivalente en el otro idioma, para el selector de idioma y hreflang.
 * Conserva el ancla (#seccion) cuando la hay.
 */
export function alternatePath(pathname: string, target: Locale): string {
  const clean = pathname.replace(/\/$/, "") || "/";
  for (const s of SERVICE_SLUGS) {
    if (clean === servicePath("es", s.es) || clean === servicePath("en", s.en)) return servicePath(target, s[target]);
  }
  return target === "en" ? "/en" : "/";
}
