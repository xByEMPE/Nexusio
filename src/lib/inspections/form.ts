/** Texto recortado; vacío o ausente → undefined. */
export function optStr(fd: FormData, k: string): string | undefined {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? undefined : v;
}

/** Número; vacío o ausente → undefined; texto no numérico → NaN (que Zod rechaza). */
export function optNum(fd: FormData, k: string): number | undefined {
  const v = optStr(fd, k);
  return v === undefined ? undefined : Number(v.replace(",", "."));
}

/** Contactos en texto, uno por línea: «Rol | Nombre | correo» (el correo es opcional). */
export function parseContacts(raw: string): { role: string; name: string; email?: string }[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [role = "", name = "", email = ""] = line.split("|").map((p) => p.trim());
      return email ? { role, name, email } : { role, name };
    });
}

export function formatContacts(contacts: unknown): string {
  if (!Array.isArray(contacts)) return "";
  return contacts
    .map((c) => {
      const o = (c ?? {}) as { role?: unknown; name?: unknown; email?: unknown };
      return [o.role, o.name, o.email].filter((p) => typeof p === "string" && p).join(" | ");
    })
    .join("\n");
}
