import type { Dictionary } from "@/i18n/types";
import { LOCALES, type Locale } from "@/i18n/config";
import { companyPath, SERVICE_SLUGS, servicePath } from "@/i18n/routes";
import { absoluteUrl, SITE } from "@/lib/seo";
import { CONTENT_POLICY } from "./tools";

const HEADINGS: Record<Locale, { section: string; home: string; about: string; contact: string }> = {
  es: { section: "Español", home: "Inicio", about: "Acerca de NEXUS", contact: "Contacto" },
  en: { section: "English", home: "Home", about: "About NEXUS", contact: "Contact" },
};

/** /llms.txt (llmstxt.org), generado desde seo.ts y los diccionarios. */
export function buildLlmsTxt(getDictionary: (l: Locale) => Dictionary): string {
  const out: string[] = [];
  out.push(`# ${SITE.name}`, "");
  out.push(`> ${SITE.description}`, "");
  out.push(
    "Sitio público bilingüe (es-MX / en) de NEXUS, desarrollador independiente de software para drones DJI y servicios web, en México.",
    "",
  );

  for (const locale of LOCALES) {
    const t = getDictionary(locale);
    const h = HEADINGS[locale];
    out.push(`## ${h.section}`, "");
    out.push(`- [${h.home}](${absoluteUrl(t.meta.homePath)}): ${t.meta.description}`);
    for (const s of SERVICE_SLUGS) {
      const page = t.servicePages.find((p) => p.slug === s[locale]);
      if (page) out.push(`- [${page.h1}](${absoluteUrl(servicePath(locale, page.slug))}): ${page.metaDescription}`);
    }
    out.push(`- [${h.about}](${absoluteUrl(companyPath(locale, "about"))}): ${t.company.aboutPage.metaDescription}`);
    out.push(`- [${h.contact}](${absoluteUrl(companyPath(locale, "contact"))}): ${t.company.contactPage.metaDescription}`);
    out.push("");
  }

  out.push("## Contacto / Contact", "");
  out.push(`- Email: ${SITE.email}`);
  out.push(`- Formulario / Form: ${absoluteUrl("/#evaluacion")} · ${absoluteUrl("/en#evaluacion")}`, "");

  out.push("## Interfaces para agentes / Agent interfaces", "");
  out.push(
    `- [Markdown](${absoluteUrl("/index.md")}): versión en Markdown de cada página con "Accept: text/markdown" (EN: ${absoluteUrl("/en/index.md")}).`,
  );
  out.push(`- [MCP server card](${absoluteUrl("/.well-known/mcp/server-card.json")}): descripción del servidor MCP.`);
  out.push(`- [MCP endpoint](${absoluteUrl("/api/mcp")}): Streamable HTTP, solo lectura, sin autenticación.`);
  out.push(`- [Sitemap](${absoluteUrl("/sitemap.xml")})`, "");

  out.push("## Uso del contenido / Content use policy", "");
  out.push(`Content-Signal: ${CONTENT_POLICY}`, "");
  out.push(
    "Se permite el uso para búsqueda y como entrada de IA (respuestas con cita); no se permite el entrenamiento de modelos.",
    "Search and AI-input use is allowed; AI training is not.",
    "",
  );
  return out.join("\n");
}
