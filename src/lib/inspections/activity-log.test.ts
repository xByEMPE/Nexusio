import { describe, expect, it } from "vitest";
import {
  activityScope,
  applyActivityQuery,
  buildActivityEntries,
  collectLookupIds,
  dayEndIso,
  dayStartIso,
  emptyLookups,
  filtersToParams,
  PAGE_SIZE,
  paginate,
  parseActivityFilters,
  sanitizeSearch,
  searchOrFilter,
  summarizeChange,
  type LogRow,
} from "./activity-log";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333";

/** Doble del constructor de consultas: registra cada llamada. */
function recorder() {
  const calls: [string, unknown[]][] = [];
  const q: Record<string, (...a: unknown[]) => unknown> = {};
  for (const name of ["eq", "neq", "in", "not", "gte", "lte", "lt", "or", "order", "limit"]) {
    q[name] = (...a: unknown[]) => (calls.push([name, a]), q);
  }
  return { q, calls };
}

describe("autorización", () => {
  it("admin ve todo, técnico solo proyectos, el resto nada", () => {
    expect(activityScope("admin")).toBe("all");
    expect(activityScope("technician")).toBe("projects");
    expect(activityScope("service")).toBeNull();
    expect(activityScope(null)).toBeNull();
    expect(activityScope(undefined)).toBeNull();
  });
});

describe("parseActivityFilters", () => {
  it("acepta valores válidos", () => {
    const f = parseActivityFilters({ usuario: U1, entidad: "asset", accion: "update", proyecto: P1, desde: "2026-11-01", hasta: "2026-11-20", q: "WTG 25", cursor: "120" });
    expect(f).toEqual({ actor: U1, entity: "asset", action: "update", project: P1, from: "2026-11-01", to: "2026-11-20", q: "WTG 25", cursor: 120 });
  });
  it("ignora lo inválido (uuid, entidad, acción, fechas imposibles, cursor)", () => {
    expect(parseActivityFilters({ usuario: "x", entidad: "drop table", accion: "borrar", proyecto: "1", desde: "2026-02-31", hasta: "ayer", cursor: "-5" })).toEqual({});
    expect(parseActivityFilters({ cursor: "1e9" })).toEqual({});
  });
  it("toma el primer valor si viene repetido", () => {
    expect(parseActivityFilters({ accion: ["insert", "delete"] }).action).toBe("insert");
  });
  it("sanea la búsqueda: sin comodines ni separadores de filtro; mínimo 2 caracteres", () => {
    expect(sanitizeSearch("a%,b)(")).toBe("ab");
    expect(sanitizeSearch("x")).toBeUndefined();
    expect(sanitizeSearch("  WTG   25 ")).toBe("WTG 25");
    expect(sanitizeSearch("Peña_Nieto-1.2")).toBe("Peña_Nieto-1.2");
  });
  it("filtersToParams conserva los filtros y agrega el cursor", () => {
    const p = filtersToParams({ actor: U1, action: "delete", q: "WTG" }, 77);
    expect(p.get("usuario")).toBe(U1);
    expect(p.get("accion")).toBe("delete");
    expect(p.get("q")).toBe("WTG");
    expect(p.get("cursor")).toBe("77");
    expect(filtersToParams({}).toString()).toBe("");
  });
});

describe("applyActivityQuery (filtros y paginación por cursor)", () => {
  it("sin filtros: orden por id desc y una fila extra para saber si hay más", () => {
    const { q, calls } = recorder();
    applyActivityQuery(q, "all", {});
    expect(calls).toEqual([
      ["order", ["id", { ascending: false }]],
      ["limit", [PAGE_SIZE + 1]],
    ]);
  });
  it("admin (all) no excluye eventos globales", () => {
    const { q, calls } = recorder();
    applyActivityQuery(q, "all", {});
    expect(calls.some(([n]) => n === "not" || n === "neq")).toBe(false);
  });
  it("técnico (projects): excluye eventos globales y asignaciones", () => {
    const { q, calls } = recorder();
    applyActivityQuery(q, "projects", {});
    expect(calls).toContainEqual(["not", ["project_id", "is", null]]);
    expect(calls).toContainEqual(["neq", ["table_name", "project_assignments"]]);
  });
  it("aplica usuario, entidad (varias tablas), acción, proyecto, rango y cursor", () => {
    const { q, calls } = recorder();
    applyActivityQuery(q, "all", { actor: U1, entity: "asset", action: "update", project: P1, from: "2026-11-01", to: "2026-11-20", cursor: 500 });
    expect(calls).toContainEqual(["eq", ["actor_id", U1]]);
    expect(calls).toContainEqual(["in", ["table_name", ["assets", "wind_turbine_specs"]]]);
    expect(calls).toContainEqual(["eq", ["action", "update"]]);
    expect(calls).toContainEqual(["eq", ["project_id", P1]]);
    expect(calls).toContainEqual(["gte", ["at", "2026-11-01T06:00:00.000Z"]]);
    expect(calls).toContainEqual(["lte", ["at", "2026-11-21T05:59:59.999Z"]]);
    expect(calls).toContainEqual(["lt", ["id", 500]]);
  });
  it("búsqueda: filtro or sobre objeto, proyecto y autor con los ids encontrados", () => {
    const { q, calls } = recorder();
    applyActivityQuery(q, "all", { q: "WTG" }, [U1, P1]);
    expect(calls).toContainEqual(["or", [`row_id.in.(${U1},${P1}),project_id.in.(${U1},${P1}),actor_id.in.(${U1},${P1})`]]);
    expect(searchOrFilter(["no-uuid", U1])).toBe(`row_id.in.(${U1}),project_id.in.(${U1}),actor_id.in.(${U1})`);
  });
  it("las fechas límite usan UTC-6", () => {
    expect(dayStartIso("2026-01-15")).toBe("2026-01-15T06:00:00.000Z");
    expect(dayEndIso("2026-01-15")).toBe("2026-01-16T05:59:59.999Z");
  });
});

describe("paginate", () => {
  const rows = (n: number, from = 1000) => Array.from({ length: n }, (_, i) => ({ id: from - i }));
  it("menos o igual a una página: sin cursor siguiente", () => {
    expect(paginate(rows(10)).nextCursor).toBeNull();
    expect(paginate(rows(PAGE_SIZE)).nextCursor).toBeNull();
    expect(paginate(rows(PAGE_SIZE)).rows).toHaveLength(PAGE_SIZE);
  });
  it("con una fila de más: recorta a 50 y el cursor es el id de la última mostrada (estable, id desc)", () => {
    const r = paginate(rows(PAGE_SIZE + 1));
    expect(r.rows).toHaveLength(PAGE_SIZE);
    expect(r.nextCursor).toBe(1000 - (PAGE_SIZE - 1));
    expect(r.rows[0]!.id).toBeGreaterThan(r.rows[PAGE_SIZE - 1]!.id);
  });
});

describe("summarizeChange: lista blanca y formato", () => {
  it("update de proyecto: estado antes → después con etiquetas en español", () => {
    expect(summarizeChange("projects", "update", { status: "in_field" }, { status: "in_review" })).toEqual([
      { label: "Estado", before: "En campo", after: "En revisión" },
    ]);
  });
  it("insert y delete muestran solo el lado que existe", () => {
    expect(summarizeChange("assets", "insert", null, { name: "WTG 25", kind: "wind_turbine" })).toEqual([
      { label: "Tipo", before: null, after: "Turbina" },
      { label: "Nombre", before: null, after: "WTG 25" },
    ]);
    expect(summarizeChange("sites", "delete", { name: "Parque Sur" }, null)).toEqual([{ label: "Nombre", before: "Parque Sur", after: null }]);
  });
  it("nunca muestra columnas fuera de la lista blanca (correo, tokens, hashes)", () => {
    const secret = { email: "a@b.mx", encrypted_password: "$2a$hash", access_token: "tok", phone: "555", platform_role: "admin", is_active: true };
    const lines = summarizeChange("profiles", "insert", null, secret);
    expect(lines.map((l) => l.label)).toEqual(["Rol", "Cuenta activa"]);
    expect(JSON.stringify(lines)).not.toMatch(/a@b\.mx|hash|tok|555/);
    expect(summarizeChange("tabla_desconocida", "insert", null, secret)).toEqual([]);
  });
  it("ignora valores que parecen correos solo si su columna no está permitida", () => {
    const lines = summarizeChange("comments", "insert", null, { body: "hola", email: "x@y.mx" });
    expect(lines).toEqual([{ label: "Texto", before: null, after: "hola" }]);
  });
  it("daños: reutiliza las etiquetas del historial y la región solo como «marcada»", () => {
    const lines = summarizeChange("findings", "update", { severity: 3, region: true }, { severity: 4, region: true });
    expect(lines).toContainEqual({ label: "Severidad", before: "3", after: "4" });
    expect(lines.find((l) => l.label === "Región")).toBeUndefined();
  });
  it("booleanos y roles", () => {
    expect(summarizeChange("profiles", "update", { is_active: true }, { is_active: false })).toEqual([{ label: "Cuenta activa", before: "Sí", after: "No" }]);
    expect(summarizeChange("organization_members", "update", { role: "client_viewer" }, { role: "client_manager" })).toEqual([
      { label: "Rol", before: "Lector", after: "Gerente" },
    ]);
  });
  it("referencias: usa los nombres resueltos y «eliminado» si ya no existen", () => {
    const l = emptyLookups();
    l.organizations.set(U1, "Eólica Norte");
    expect(summarizeChange("projects", "insert", null, { organization_id: U1 }, l)).toEqual([{ label: "Organización", before: null, after: "Eólica Norte" }]);
    expect(summarizeChange("projects", "insert", null, { organization_id: U2 }, l)[0]!.after).toBe("organización eliminada");
  });
});

const row = (over: Partial<LogRow>): LogRow => ({
  id: 1,
  at: "2026-11-20T18:00:00Z",
  action: "update",
  actor_id: U1,
  table_name: "assets",
  row_id: U2,
  project_id: null,
  old: null,
  new: null,
  ...over,
});

describe("buildActivityEntries", () => {
  it("actor: usuario con rol, «Usuario eliminado» si ya no existe, «Sistema / IA» si es null", () => {
    const l = emptyLookups();
    l.users.set(U1, { name: "Ana Pérez", role: "technician" });
    const [a, b, c] = buildActivityEntries([row({}), row({ id: 2, actor_id: U2 }), row({ id: 3, actor_id: null })], l);
    expect(a!.actor).toEqual({ kind: "user", name: "Ana Pérez", role: "Técnico" });
    expect(b!.actor).toEqual({ kind: "deleted", name: "Usuario eliminado", role: null });
    expect(c!.actor).toEqual({ kind: "system", name: "Sistema / IA", role: null });
  });
  it("cliente sin rol de plataforma: rol «Cliente»", () => {
    const l = emptyLookups();
    l.users.set(U1, { name: "Cli", role: null });
    expect(buildActivityEntries([row({})], l)[0]!.actor.role).toBe("Cliente");
  });
  it("acción, entidad, nombre del objeto y proyecto", () => {
    const l = emptyLookups();
    l.users.set(U1, { name: "Ana", role: "admin" });
    l.assets.set(U2, "WTG 25");
    l.projects.set(P1, "Parque Norte 2026");
    const e = buildActivityEntries([row({ action: "delete", project_id: P1 }), row({ id: 2, action: "insert", table_name: "projects", row_id: P1, project_id: P1, new: { name: "Parque Norte 2026" } })], l);
    expect(e[0]).toMatchObject({ actionLabel: "Eliminó", entity: "Activo", objectName: "WTG 25", projectName: "Parque Norte 2026" });
    expect(e[1]).toMatchObject({ actionLabel: "Creó", entity: "Proyecto", objectName: "Parque Norte 2026" });
  });
  it("proyecto borrado: «Proyecto eliminado»; evento global: sin proyecto", () => {
    const [a, b] = buildActivityEntries([row({ project_id: P1 }), row({ id: 2 })], emptyLookups());
    expect(a!.projectName).toBe("Proyecto eliminado");
    expect(b!.projectName).toBeNull();
  });
  it("eliminación de usuario: se muestra como «Usuario eliminado» sin datos personales", () => {
    const e = buildActivityEntries(
      [row({ action: "delete", table_name: "profiles", row_id: U2, old: { platform_role: "technician", is_active: false, organization_ids: [P1], comments_deleted: 2 } })],
      emptyLookups(),
    )[0]!;
    expect(e).toMatchObject({ entity: "Usuario", objectName: "Usuario eliminado", actionLabel: "Eliminó" });
    expect(JSON.stringify(e)).not.toMatch(/@/);
    expect(e.lines).toEqual([
      { label: "Rol", before: "Técnico", after: null },
      { label: "Cuenta activa", before: "No", after: null },
    ]);
  });
  it("inspección: el nombre sale del activo; foto: del archivo; daño: del tipo", () => {
    const l = emptyLookups();
    l.inspectionAssets.set(U2, P1);
    l.assets.set(P1, "WTG 07");
    l.captureFiles.set(U1, "DJI_0001.JPG");
    l.findingTypes.set(P1, "Grieta");
    l.findingTypeOf.set(U2, P1);
    const e = buildActivityEntries(
      [row({ table_name: "inspections", row_id: U2 }), row({ id: 2, table_name: "captures", row_id: U1 }), row({ id: 3, table_name: "findings", row_id: U2 })],
      l,
    );
    expect(e.map((x) => x.objectName)).toEqual(["WTG 07", "DJI_0001.JPG", "Grieta"]);
  });
});

describe("collectLookupIds (una consulta por tipo, sin N+1)", () => {
  it("junta ids sin repetir", () => {
    const ids = collectLookupIds([
      row({ project_id: P1 }),
      row({ id: 2, project_id: P1, actor_id: U1 }),
      row({ id: 3, table_name: "organization_members", row_id: U2, new: { organization_id: P1, role: "client_viewer" } }),
    ]);
    expect(ids.projects).toEqual([P1]);
    expect(ids.users.sort()).toEqual([U1, U2].sort());
    expect(ids.organizations).toEqual([P1]);
    expect(ids.assets).toEqual([U2]);
  });
});
