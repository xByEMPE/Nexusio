/** Solo rutas internas: empiezan con "/" y no con "//"; sin "\" ni caracteres de control. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\x00-\x1f\x7f]/.test(next)) {
    return fallback;
  }
  return next;
}
