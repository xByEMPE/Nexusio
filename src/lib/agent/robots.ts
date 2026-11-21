import { absoluteUrl } from "@/lib/seo";
import { CONTENT_POLICY } from "./tools";

/**
 * robots.txt con señales de uso de contenido (IETF aipref / Content-Signal):
 * se permite búsqueda y uso como entrada de IA (respuestas), no el entrenamiento.
 * `Allow: /api/mcp` gana a `Disallow: /api/` por ser más específico.
 */
export function buildRobotsTxt(): string {
  return [
    "User-agent: *",
    `Content-Signal: ${CONTENT_POLICY}`,
    "Allow: /",
    "Allow: /api/mcp",
    "Disallow: /admin",
    "Disallow: /portal",
    "Disallow: /auth",
    "Disallow: /api/",
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    "",
  ].join("\n");
}
