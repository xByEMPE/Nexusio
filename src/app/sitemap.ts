import type { MetadataRoute } from "next";
import { SERVICE_SLUGS, servicePath } from "@/i18n/routes";
import { absoluteUrl } from "@/lib/seo";

/** Cada URL declara su versión en el otro idioma (hreflang en el sitemap). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pair = (es: string, en: string, priority: number): MetadataRoute.Sitemap => {
    const languages = { "es-MX": absoluteUrl(es), en: absoluteUrl(en) };
    return [
      { url: absoluteUrl(es), lastModified: now, changeFrequency: "monthly", priority, alternates: { languages } },
      { url: absoluteUrl(en), lastModified: now, changeFrequency: "monthly", priority, alternates: { languages } },
    ];
  };
  return [
    ...pair("/", "/en", 1),
    ...SERVICE_SLUGS.flatMap((s) => pair(servicePath("es", s.es), servicePath("en", s.en), 0.8)),
  ];
}
