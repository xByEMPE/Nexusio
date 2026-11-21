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

/** Páginas de empresa (Acerca y Contacto) en cada idioma. */
export const COMPANY_PATHS = {
  about: { es: "/acerca", en: "/en/about" },
  contact: { es: "/contacto", en: "/en/contact" },
} as const;
export type CompanyPage = keyof typeof COMPANY_PATHS;

export function companyPath(locale: Locale, page: CompanyPage): string {
  return COMPANY_PATHS[page][locale];
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
  for (const c of Object.values(COMPANY_PATHS)) {
    if (clean === c.es || clean === c.en) return c[target];
  }
  return target === "en" ? "/en" : "/";
}
