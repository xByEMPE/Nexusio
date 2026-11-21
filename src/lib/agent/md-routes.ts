/**
 * Rutas que ofrecen versión Markdown y la regla de negociación de contenido.
 * Sin dependencias: lo importa también next.config.ts.
 */

/**
 * Coincide cuando el Accept pide text/markdown y text/html NO aparece antes
 * (un navegador, o un cliente que prefiere HTML primero, sigue recibiendo HTML).
 */
export const ACCEPT_MARKDOWN_PATTERN =
  "^(?!.*text/html.*text/markdown)(?!.*text/markdown[ ]*;[ ]*q=0([.]0{0,3})?[ ]*(,|$)).*text/markdown.*$";

/** Rutas públicas con versión Markdown; `:slug` se conserva en el destino. */
export const MARKDOWN_SOURCES: readonly string[] = [
  "/",
  "/en",
  "/servicios/:slug",
  "/en/services/:slug",
  "/acerca",
  "/contacto",
  "/en/about",
  "/en/contact",
];

/** Alias de descubrimiento -> ruta equivalente. */
export const MARKDOWN_ALIASES: Readonly<Record<string, string>> = {
  "/index.md": "/",
  "/en/index.md": "/en",
};

export const MARKDOWN_HANDLER = "/api/md";

/** Destino interno de una ruta pública: el handler es /api/md/[...path] (index = inicio). */
export function markdownDestination(publicPath: string): string {
  return publicPath === "/" ? `${MARKDOWN_HANDLER}/index` : `${MARKDOWN_HANDLER}${publicPath}`;
}
