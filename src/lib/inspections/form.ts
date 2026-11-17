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

export type TurbineListLine = { name: string; code?: string; lat?: number; lon?: number };
export type TurbineListError = { line: number; message: string };

/** Máximo de turbinas por alta (igual que MAX_FIELD_TURBINES del contrato). */
const MAX_TURBINES = 300;

/**
 * Turbinas en texto, una por línea: «nombre | código | lat | lon» (código, lat y lon opcionales).
 * Se ignoran líneas vacías y las que empiezan con «#». Los errores llevan el número de línea original.
 */
export function parseTurbineList(raw: string): { turbines: TurbineListLine[]; errors: TurbineListError[] } {
  const turbines: TurbineListLine[] = [];
  const errors: TurbineListError[] = [];
  const firstSeen = new Map<string, number>();

  raw.split(/\r?\n/).forEach((text, i) => {
    const line = i + 1;
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const err = (message: string) => errors.push({ line, message });

    const cols = trimmed.split("|").map((p) => p.trim());
    if (cols.length > 4) return err("Demasiadas columnas: usa «nombre | código | lat | lon».");
    const [name = "", code = "", latRaw = "", lonRaw = ""] = cols;
    if (name === "") return err("Falta el nombre de la turbina.");
    if (name.length > 60) return err("El nombre de la turbina no puede pasar de 60 caracteres.");
    if (code.length > 60) return err("El código no puede pasar de 60 caracteres.");

    let lat: number | undefined;
    let lon: number | undefined;
    if (latRaw !== "" || lonRaw !== "") {
      if (latRaw === "" || lonRaw === "") return err("Indica latitud y longitud juntas, o ninguna.");
      lat = Number(latRaw.replace(",", "."));
      lon = Number(lonRaw.replace(",", "."));
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) return err("La latitud debe ser un número entre -90 y 90.");
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) return err("La longitud debe ser un número entre -180 y 180.");
    }

    const prev = firstSeen.get(name);
    if (prev !== undefined) return err(`«${name}» está repetida (ya aparece en la línea ${prev}).`);
    firstSeen.set(name, line);
    if (turbines.length >= MAX_TURBINES) {
      if (!errors.some((e) => e.message.includes(String(MAX_TURBINES)))) err(`Máximo ${MAX_TURBINES} turbinas por proyecto.`);
      return;
    }

    const t: TurbineListLine = { name };
    if (code !== "") t.code = code;
    if (lat !== undefined && lon !== undefined) {
      t.lat = lat;
      t.lon = lon;
    }
    turbines.push(t);
  });
  return { turbines, errors };
}

/**
 * Lee el formulario «Nuevo proyecto de campo» y arma la entrada del contrato `FieldProjectSchema`.
 * No valida: las turbinas se leen aquí (con sus errores por línea) y el resto lo valida Zod.
 */
export function readFieldProjectForm(fd: FormData): { input: unknown; lineErrors: TurbineListError[] } {
  const { turbines, errors } = parseTurbineList(String(fd.get("turbines") ?? ""));
  const specs = {
    manufacturer: optStr(fd, "manufacturer"),
    model: optStr(fd, "model"),
    blade_length_m: optNum(fd, "blade_length_m"),
    rotor_diameter_m: optNum(fd, "rotor_diameter_m"),
    hub_height_m: optNum(fd, "hub_height_m"),
  };
  const hasSpecs = Object.values(specs).some((v) => v !== undefined);
  const input = {
    org:
      optStr(fd, "org_mode") === "new"
        ? { mode: "new", name: optStr(fd, "org_name"), slug: optStr(fd, "org_slug") }
        : { mode: "existing", id: optStr(fd, "organization_id") },
    site:
      optStr(fd, "site_mode") === "new"
        ? {
            mode: "new",
            kind: "wind_farm",
            name: optStr(fd, "site_name"),
            lat: optNum(fd, "site_lat"),
            lon: optNum(fd, "site_lon"),
          }
        : { mode: "existing", id: optStr(fd, "site_id") },
    turbines,
    specs: hasSpecs ? specs : undefined,
    project: {
      name: optStr(fd, "project_name"),
      code: optStr(fd, "project_code"),
      status: optStr(fd, "project_status") ?? "in_field",
      start_date: optStr(fd, "start_date"),
      end_date: optStr(fd, "end_date"),
    },
    technician: {
      email: optStr(fd, "technician_email")?.toLowerCase(),
      full_name: optStr(fd, "technician_name"),
    },
  };
  return { input, lineErrors: errors };
}
