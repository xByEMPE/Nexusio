import { getDictionary } from "@/i18n";
import { buildLlmsTxt } from "@/lib/agent/llms";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(getDictionary), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
