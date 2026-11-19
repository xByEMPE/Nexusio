import { createHash } from "node:crypto";

/**
 * Tipos de imagen que entrega `/api/media/<tipo>/<id>`:
 * - `thumb` / `preview`: miniatura y vista previa de una captura (`captures.thumb_path` / `preview_path`).
 * - `idthumb`: foto `_ID` del mapa: miniatura y, si no hay, la vista previa.
 * - `strip`: tira de pala (`mosaics.path`).
 */
export type MediaKind = "thumb" | "preview" | "idthumb" | "strip";

const short = (x: string) => createHash("sha256").update(x).digest("hex").slice(0, 12);

/**
 * Versión (`?v=`) de una captura: identifica el CONTENIDO (`sha256` de la fila) y la ruta; no usa `updated_at`
 * (un UPDATE de la fila no cambia la imagen). Solo si faltara el sha256 respalda con `updated_at`.
 * Contrato: todo reemplazo de contenido debe cambiar la ruta o la fila (p. ej. su sha256).
 */
export function captureVersion(sha256: string | null | undefined, path: string, updatedAt: string | null | undefined): string {
  return short(`c|${sha256 || `u:${updatedAt ?? ""}`}|${path}`);
}

/** Las tiras nuevas llevan el hash del contenido en el nombre: `strip-{sha8}.webp`. */
const HASHED_STRIP = /(^|\/)strip-[0-9a-f]{8}(\.|$)/;

/**
 * Versión de una tira: hash de la RUTA. Si la ruta lleva `strip-{sha8}` un reproceso cambia la ruta (y la
 * versión) y calibrar (UPDATE de `updated_at`) no rompe la caché. Una tira antigua en ruta fija
 * (`strip.webp`) añade `updated_at` como respaldo.
 */
export function mosaicVersion(path: string, updatedAt: string | null | undefined): string {
  return short(`m|${path}${HASHED_STRIP.test(path) ? "" : `|${updatedAt ?? ""}`}`);
}

/**
 * URL pública (relativa) de una imagen del portal. `version` (de `captureVersion`/`mosaicVersion`) solo sirve
 * para romper la caché del navegador cuando la imagen cambia: no interviene en la autorización.
 */
export function mediaUrl(kind: MediaKind, id: string, version: string | null | undefined): string {
  const base = `/api/media/${kind}/${id}`;
  return version ? `${base}?v=${version}` : base;
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
