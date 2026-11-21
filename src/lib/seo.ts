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

/**
 * Perfiles oficiales de NEXUS en redes (se emiten como `sameAs` en el JSON-LD y como enlaces
 * rel="me" en el pie de página). PEGAR AQUÍ nuevas URLs públicas de perfiles de la empresa,
 * una por elemento. Si la lista queda vacía, no se emite `sameAs` ni se muestran enlaces.
 */
export const SOCIAL_PROFILES: readonly string[] = ["https://www.linkedin.com/company/144116199/"];

/** Etiqueta legible de un perfil según su dominio (LinkedIn, etc.). */
export function socialLabel(url: string): string {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* se usa la URL tal cual */
  }
  if (host === "linkedin.com") return "LinkedIn";
  if (host === "x.com" || host === "twitter.com") return "X";
  if (host === "instagram.com") return "Instagram";
  if (host === "facebook.com") return "Facebook";
  if (host === "youtube.com") return "YouTube";
  if (host === "tiktok.com") return "TikTok";
  return host;
}

/** `{ sameAs: [...] }` solo cuando hay perfiles; con la lista vacía devuelve `{}`. */
export function sameAsProps(profiles: readonly string[] = SOCIAL_PROFILES): { sameAs?: string[] } {
  return profiles.length > 0 ? { sameAs: [...profiles] } : {};
}

export const ORG_ID = `${SITE.url}/#organizacion`;
export const WEBSITE_ID = `${SITE.url}/#sitio`;

export interface OrganizationInput {
  readonly description: string;
  /** Temas de los servicios (palabras clave de cada página de servicio). */
  readonly knowsAbout: readonly string[];
  readonly offers?: { readonly name: string; readonly items: readonly { readonly name: string; readonly url: string }[] };
  readonly profiles?: readonly string[];
}

/** Único nodo Organization del sitio; el resto del JSON-LD lo referencia por @id. */
export function organizationNode(input: OrganizationInput) {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    url: SITE.url,
    logo: {
      "@type": "ImageObject",
      "@id": `${SITE.url}/#logo`,
      url: absoluteUrl("/apple-icon.png"),
      contentUrl: absoluteUrl("/apple-icon.png"),
      width: 180,
      height: 180,
    },
    image: absoluteUrl("/opengraph-image"),
    description: input.description,
    email: SITE.email,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: SITE.email,
      url: absoluteUrl("/#evaluacion"),
      availableLanguage: ["es", "en"],
    },
    areaServed: { "@type": "Country", name: "México" },
    knowsAbout: [...input.knowsAbout],
    inLanguage: ["es-MX", "en"],
    ...(input.offers
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: input.offers.name,
            itemListElement: input.offers.items.map((i) => ({
              "@type": "Offer",
              itemOffered: { "@type": "Service", name: i.name, url: i.url },
            })),
          },
        }
      : {}),
    ...sameAsProps(input.profiles),
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE.url,
    name: SITE.name,
    inLanguage: ["es-MX", "en"],
    publisher: { "@id": ORG_ID },
  };
}
