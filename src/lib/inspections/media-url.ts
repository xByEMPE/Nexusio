import { createHash } from "node:crypto";

/**
 * Tipos de imagen que entrega `/api/media/<tipo>/<id>`:
 * - `thumb` / `preview`: miniatura y vista previa de una captura (`captures.thumb_path` / `preview_path`).
 * - `idthumb`: foto `_ID` del mapa: miniatura y, si no hay, la vista previa.
 * - `strip`: tira de pala (`mosaics.path`).
 */
export type MediaKind = "thumb" | "preview" | "idthumb" | "strip";

/**
 * URL pública (relativa) de una imagen del portal. `version` (la `updated_at` de la fila) solo sirve para
 * romper la caché del navegador cuando la imagen cambia: no interviene en la autorización.
 */
export function mediaUrl(kind: MediaKind, id: string, version: string | null | undefined): string {
  const ms = version ? Date.parse(version) : NaN;
  const base = `/api/media/${kind}/${id}`;
  return Number.isFinite(ms) ? `${base}?v=${ms.toString(36)}` : base;
}

/** ETag derivado de tipo, id, ruta y versión de la fila (sin revelar la ruta). */
export function mediaEtag(kind: MediaKind, id: string, path: string, version: string | null | undefined): string {
  const h = createHash("sha256").update(`${kind}\n${id}\n${path}\n${version ?? ""}`).digest("hex").slice(0, 32);
  return `"${h}"`;
}

/** `If-None-Match` coincide con el ETag (lista, validadores débiles `W/` y comodín `*`). */
export function etagMatches(etag: string, ifNoneMatch: string | null | undefined): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  return ifNoneMatch.split(",").some((t) => t.trim().replace(/^W\//, "") === etag);
}
