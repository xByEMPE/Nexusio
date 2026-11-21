import { getDictionary } from "@/i18n";
import { markdownForPath } from "@/lib/agent/markdown";

export const dynamic = "force-dynamic";

/**
 * Destino de las rewrites de next.config.ts (Accept: text/markdown y /index.md).
 * Solo sirve páginas públicas conocidas; cualquier otra ruta responde 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const segments = (await params).path;
  const path = segments.length === 1 && segments[0] === "index" ? "/" : `/${segments.join("/")}`;
  const md = path.length <= 200 ? markdownForPath(path, getDictionary) : null;
  if (md === null) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
