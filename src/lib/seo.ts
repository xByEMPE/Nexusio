/** Datos comunes de SEO. El dominio se puede sobrescribir con SITE_URL. */
export const SITE = {
  url: (process.env.SITE_URL ?? "https://nexusio.com.mx").replace(/\/$/, ""),
  name: "NEXUS",
  email: "contacto@nexusio.com.mx",
  locale: "es_MX",
  defaultTitle: "NEXUS | Apps para drones DJI y software de inspección en México",
  description:
    "Desarrollamos apps a medida para drones DJI, plataformas para gestionar inspecciones con drones y páginas web para empresas en México. Evaluación sin costo.",
} as const;

/** Imagen para redes sociales (generada por app/opengraph-image.tsx). */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "NEXUS · Apps para drones DJI y software de inspección" };

export function absoluteUrl(path = "/"): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Serializa JSON-LD sin permitir cerrar la etiqueta <script> desde los datos. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
