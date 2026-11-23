import { describe, expect, it } from "vitest";
import { loadActivityPage } from "./activity-loader";
import { PAGE_SIZE } from "./activity-log";

const U1 = "11111111-1111-4111-8111-111111111111";
const P1 = "33333333-3333-4333-8333-333333333333";
const A1 = "44444444-4444-4444-8444-444444444444";

type Calls = { table: string; method: string; args: unknown[] }[];

/** Doble de Supabase: cada `from(tabla)` responde con el resultado de esa tabla y registra la cadena de llamadas. */
function fakeSb(results: Record<string, { data: unknown; error?: unknown }>) {
  const calls: Calls = [];
  const from = (table: string) => {
    const result: { data: unknown; error?: unknown } = { error: null, ...(results[table] ?? { data: [] }) };
    const b: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(b, {
      get(_t, key: string) {
        if (key === "then") return (resolve: (v: unknown) => unknown) => resolve(result);
        return (...args: unknown[]) => (calls.push({ table, method: key, args }), proxy);
      },
    });
    calls.push({ table, method: "from", args: [] });
    return proxy;
  };
  return { sb: { from } as never, calls };
}

const logRow = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  at: "2026-11-20T18:00:00Z",
  action: "update",
  actor_id: U1,
  table_name: "assets",
  row_id: A1,
  project_id: P1,
  old: { name: "WTG 24" },
  new: { name: "WTG 25" },
  ...over,
});

const fromCount = (calls: Calls, table: string) => calls.filter((c) => c.table === table && c.method === "from").length;

describe("loadActivityPage: autorización", () => {
  it("cliente / servicio (sin alcance): no autorizado y no consulta nada", async () => {
    const { sb, calls } = fakeSb({});
    const r = await loadActivityPage(sb, null, {});
    expect(r).toEqual({ ok: false, message: "No tienes permiso para ver el registro de cambios." });
    expect(calls).toHaveLength(0);
  });

  it("técnico: la consulta excluye eventos globales y gestión de usuarios", async () => {
    const { sb, calls } = fakeSb({ change_log: { data: [] } });
    await loadActivityPage(sb, "projects", {});
    const log = calls.filter((c) => c.table === "change_log");
    expect(log).toContainEqual({ table: "change_log", method: "not", args: ["project_id", "is", null] });
    expect(log).toContainEqual({ table: "change_log", method: "neq", args: ["table_name", "project_assignments"] });
  });

  it("admin: sin restricciones de proyecto", async () => {
    const { sb, calls } = fakeSb({ change_log: { data: [] } });
    await loadActivityPage(sb, "all", {});
    expect(calls.some((c) => c.method === "not" || c.method === "neq")).toBe(false);
  });
});

describe("loadActivityPage: resultados", () => {
  it("arma las entradas con nombres resueltos, una consulta por tabla", async () => {
    const rows = [logRow(30), logRow(29, { actor_id: null }), logRow(28, { actor_id: "99999999-9999-4999-8999-999999999999" })];
    const { sb, calls } = fakeSb({
      change_log: { data: rows },
      profiles: { data: [{ id: U1, full_name: "Ana Pérez", platform_role: "admin" }] },
      projects: { data: [{ id: P1, name: "Parque Norte" }] },
      assets: { data: [{ id: A1, name: "WTG 25" }] },
    });
    const r = await loadActivityPage(sb, "all", {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextCursor).toBeNull();
    expect(r.entries.map((e) => e.actor.name)).toEqual(["Ana Pérez", "Sistema / IA", "Usuario eliminado"]);
    expect(r.entries[0]).toMatchObject({ entity: "Activo", objectName: "WTG 25", projectName: "Parque Norte", actionLabel: "Modificó" });
    expect(r.entries[0]!.lines).toEqual([{ label: "Nombre", before: "WTG 24", after: "WTG 25" }]);
    // sin N+1: 3 filas, una sola consulta a profiles / projects / assets
    expect(fromCount(calls, "profiles")).toBe(1);
    expect(fromCount(calls, "projects")).toBe(1);
    expect(fromCount(calls, "assets")).toBe(1);
  });

  it("51 filas: devuelve 50 y el cursor de la última mostrada", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => logRow(1000 - i));
    const { sb } = fakeSb({ change_log: { data: rows }, profiles: { data: [] } });
    const r = await loadActivityPage(sb, "all", {});
    expect(r.ok && r.entries).toHaveLength(PAGE_SIZE);
    expect(r.ok && r.nextCursor).toBe(1000 - (PAGE_SIZE - 1));
  });

  it("error en la consulta o en los perfiles: falla en vez de mostrar autores falsos", async () => {
    expect((await loadActivityPage(fakeSb({ change_log: { data: null, error: { message: "x" } } }).sb, "all", {})).ok).toBe(false);
    const bad = fakeSb({ change_log: { data: [logRow(1)] }, profiles: { data: null, error: { message: "rls" } } });
    expect(await loadActivityPage(bad.sb, "all", {})).toEqual({ ok: false, message: "No se pudo leer el registro de cambios." });
  });

  it("búsqueda sin coincidencias: página vacía sin consultar el registro", async () => {
    const { sb, calls } = fakeSb({});
    const r = await loadActivityPage(sb, "all", { q: "inexistente" });
    expect(r).toEqual({ ok: true, entries: [], nextCursor: null });
    expect(fromCount(calls, "change_log")).toBe(0);
  });

  it("búsqueda con coincidencias: filtra por esos ids", async () => {
    const { sb, calls } = fakeSb({ projects: { data: [{ id: P1 }] }, change_log: { data: [] } });
    await loadActivityPage(sb, "all", { q: "Norte" });
    const or = calls.find((c) => c.table === "change_log" && c.method === "or");
    expect(or?.args[0]).toBe(`row_id.in.(${P1}),project_id.in.(${P1}),actor_id.in.(${P1})`);
  });
});
