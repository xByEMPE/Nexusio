import type { MetadataRoute } from "next";
import { SERVICE_PAGES } from "@/content/service-pages";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "monthly", priority: 1 },
    ...SERVICE_PAGES.map((p) => ({
      url: absoluteUrl(`/servicios/${p.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
