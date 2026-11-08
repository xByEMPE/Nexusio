import { jsonLd } from "@/lib/seo";

/** Datos estructurados (schema.org) para que Google entienda el contenido. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
