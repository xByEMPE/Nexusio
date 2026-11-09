/**
 * Idiomas del sitio público. El español vive en la raíz (/) y el inglés en
 * /en. El panel /admin queda solo en español.
 */
export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

/** Prefijo de URL de cada idioma ("" para el idioma por defecto). */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/** Ruta interna con el prefijo del idioma: localePath("en", "/#apps") -> "/en#apps". */
export function localePath(locale: Locale, path: string): string {
  const prefix = localePrefix(locale);
  if (!prefix) return path;
  if (path === "/") return prefix;
  if (path.startsWith("/#")) return `${prefix}${path.slice(1)}`;
  return `${prefix}${path}`;
}
