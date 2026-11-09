import type { Metadata, Viewport } from "next";
import { getDictionary, type Locale } from "./index";
import { SERVICE_SLUGS, servicePath } from "./routes";
import { OG_IMAGE, SITE } from "@/lib/seo";

/** Enlaces hreflang de una página en ambos idiomas. */
export function languageAlternates(esPath: string, enPath: string): NonNullable<Metadata["alternates"]>["languages"] {
  return { "es-MX": esPath, en: enPath, "x-default": esPath };
}

export const sharedViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
  ],
  colorScheme: "dark light",
};

/** Metadatos base de la página de inicio de cada idioma. */
export function homeMetadata(locale: Locale): Metadata {
  const t = getDictionary(locale);
  const path = t.meta.homePath;
  return {
    metadataBase: new URL(SITE.url),
    title: { default: t.meta.title, template: "%s | NEXUS" },
    description: t.meta.description,
    applicationName: SITE.name,
    alternates: { canonical: path, languages: languageAlternates("/", "/en") },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: {
      type: "website",
      locale: t.meta.ogLocale,
      alternateLocale: locale === "es" ? ["en_US"] : ["es_MX"],
      url: path,
      siteName: SITE.name,
      title: t.meta.title,
      description: t.meta.description,
      images: [{ ...OG_IMAGE, url: locale === "es" ? "/opengraph-image" : "/en/opengraph-image", alt: t.meta.ogAlt }],
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description },
    formatDetection: { telephone: false },
  };
}

/** Metadatos de una página de servicio, con su par en el otro idioma. */
export function serviceMetadata(locale: Locale, slug: string): Metadata {
  const t = getDictionary(locale);
  const page = t.servicePages.find((p) => p.slug === slug);
  const pair = SERVICE_SLUGS.find((s) => s[locale] === slug);
  if (!page || !pair) return {};
  const path = servicePath(locale, slug);
  const og = { ...OG_IMAGE, url: locale === "es" ? "/opengraph-image" : "/en/opengraph-image", alt: t.meta.ogAlt };
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: path, languages: languageAlternates(servicePath("es", pair.es), servicePath("en", pair.en)) },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE.name,
      locale: t.meta.ogLocale,
      title: page.metaTitle,
      description: page.metaDescription,
      images: [og],
    },
    twitter: { card: "summary_large_image", title: page.metaTitle, description: page.metaDescription, images: [og.url] },
  };
}
