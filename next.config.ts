import path from "node:path";
import type { NextConfig } from "next";
import { ACCEPT_MARKDOWN_PATTERN, MARKDOWN_ALIASES, MARKDOWN_SOURCES, markdownDestination } from "./src/lib/agent/md-routes";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** Cabecera Link (RFC 8288) con los recursos para agentes; EN apunta a su Markdown. */
function agentLinkHeader(markdownPath: string): string {
  return [
    '</llms.txt>; rel="describedby"; type="text/plain"',
    `<${markdownPath}>; rel="alternate"; type="text/markdown"`,
    '</sitemap.xml>; rel="sitemap"',
    '</.well-known/mcp/server-card.json>; rel="mcp-server-card"',
  ].join(", ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Oculta el indicador "N" de Next.js en desarrollo (no existe en producción).
  devIndicators: false,
  // Hay un package-lock.json en la carpeta superior; fija la raíz del proyecto aquí.
  turbopack: { root: path.resolve(__dirname) },
  images: {
    // Requerido desde Next.js 16: calidades permitidas para el optimizador.
    qualities: [75],
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Negociación de contenido: solo páginas públicas listadas (nunca /admin, /portal, /api, /_next).
        ...MARKDOWN_SOURCES.map((source) => ({
          source,
          has: [{ type: "header" as const, key: "accept", value: ACCEPT_MARKDOWN_PATTERN }],
          destination: markdownDestination(source),
        })),
        // Alias de descubrimiento.
        ...Object.entries(MARKDOWN_ALIASES).map(([source, target]) => ({
          source,
          destination: markdownDestination(target),
        })),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Las páginas con versión Markdown varían según Accept (caché correcta).
      ...MARKDOWN_SOURCES.filter((s) => s !== "/" && s !== "/en").map((source) => ({
        source,
        headers: [{ key: "Vary", value: "Accept" }],
      })),
      // Inicio: Vary + Link (RFC 8288) en una sola entrada; EN apunta a su Markdown.
      { source: "/", headers: [{ key: "Vary", value: "Accept" }, { key: "Link", value: agentLinkHeader("/index.md") }] },
      { source: "/en", headers: [{ key: "Vary", value: "Accept" }, { key: "Link", value: agentLinkHeader("/en/index.md") }] },
    ];
  },
};

export default nextConfig;
