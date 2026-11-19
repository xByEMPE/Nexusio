import { describe, expect, test, vi } from "vitest";
import type { DeletionPreview } from "@/lib/inspections/deletion-types";
import { runDeletionStep, type FlowDeps } from "./deletion-flow";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";

const preview = (over: Partial<DeletionPreview> = {}): DeletionPreview => ({
  kind: "inspection", entity_id: A, name: "WTG-01", confirm_name: "WTG-01", organization: "Org",
  project_status: null, inspections: 1, approved: 0, pending: 0, captures: 0, mosaics: 0, findings: 0,
  comments: 0, objects: 0, bytes: 0, project_sites: 0, assignments: 0,
  projects: [{ id: P, name: "Proyecto", status: "in_field", inspections: 1 }], ...over,
});

function deps(over: Partial<FlowDeps> = {}) {
  const calls: string[] = [];
  const d: FlowDeps = {
    preview: vi.fn(async () => ({ data: preview(), error: null })),
    beginScope: vi.fn(async () => (calls.push("beginScope"), { data: [A], error: null })),
    beginOne: vi.fn(async () => (calls.push("beginOne"), { error: null })),
    listObjects: vi.fn(async () => ({ data: [], error: null })),
    removeObjects: vi.fn(async () => ({ error: null })),
    finishOne: vi.fn(async () => (calls.push("finishOne"), { data: { status: "deleted" }, error: null })),
    deleteProjectRow: vi.fn(async () => (calls.push("deleteProjectRow"), { data: { status: "deleted" }, error: null })),
    mapError: (e, fallback) => (e?.code === "42501" ? "No tienes permiso para esta acción." : fallback),
    sleep: async () => {},
    ...over,
  };
  return { d, calls };
}

describe("runDeletionStep", () => {
  test("rechaza en el servidor si el nombre escrito no coincide y no toca nada", async () => {
    const { d } = deps();
    const r = await runDeletionStep(d, { kind: "inspection", id: A, projectId: null }, "wtg-01");
    expect(r).toEqual({ ok: false, message: expect.stringContaining("nombre") });
    expect(d.beginScope).not.toHaveBeenCalled();
    expect(d.beginOne).not.toHaveBeenCalled();
    expect(d.finishOne).not.toHaveBeenCalled();
  });

  test("inspección: borra y redirige al proyecto", async () => {
    const { d, calls } = deps();
    const r = await runDeletionStep(d, { kind: "inspection", id: A, projectId: null }, "WTG-01", "motivo");
    expect(r).toEqual({ ok: true, done: true, remaining: 0, redirectTo: `/admin/inspecciones/proyectos/${P}` });
    expect(calls).toEqual(["beginOne", "finishOne"]);
    expect(d.beginOne).toHaveBeenCalledWith(A, "motivo");
  });

  test("máquina: una inspección por paso y avisa cuántas quedan", async () => {
    const { d } = deps({
      preview: vi.fn(async () => ({ data: preview({ kind: "asset_inspections", entity_id: B, inspections: 3 }), error: null })),
      beginScope: vi.fn(async () => ({ data: [A, B, P], error: null })),
    });
    const r = await runDeletionStep(d, { kind: "asset_inspections", id: B, projectId: null }, "WTG-01");
    expect(r).toEqual({ ok: true, done: false, remaining: 2 });
    expect(d.finishOne).toHaveBeenCalledTimes(1);
    expect(d.finishOne).toHaveBeenCalledWith(A);
    expect(d.deleteProjectRow).not.toHaveBeenCalled();
  });

  test("máquina sin inspecciones pendientes: termina", async () => {
    const { d } = deps({
      preview: vi.fn(async () => ({ data: preview({ kind: "asset_inspections", inspections: 0 }), error: null })),
      beginScope: vi.fn(async () => ({ data: [], error: null })),
    });
    const r = await runDeletionStep(d, { kind: "asset_inspections", id: B, projectId: null }, "WTG-01");
    expect(r).toEqual({ ok: true, done: true, remaining: 0 });
  });

  test("proyecto: con la última inspección borra también el proyecto y redirige", async () => {
    const { d, calls } = deps({
      preview: vi.fn(async () => ({ data: preview({ kind: "project", confirm_name: "Proyecto A" }), error: null })),
    });
    const r = await runDeletionStep(d, { kind: "project", id: P, projectId: null }, "Proyecto A", "x");
    expect(r).toEqual({ ok: true, done: true, remaining: 0, redirectTo: "/admin/inspecciones/proyectos" });
    expect(calls).toEqual(["beginScope", "beginOne", "finishOne", "deleteProjectRow"]);
  });

  test("proyecto sin inspecciones: solo borra el proyecto", async () => {
    const { d, calls } = deps({
      preview: vi.fn(async () => ({ data: preview({ kind: "project", confirm_name: "P", inspections: 0 }), error: null })),
      beginScope: vi.fn(async () => ({ data: [], error: null })),
    });
    const r = await runDeletionStep(d, { kind: "project", id: P, projectId: null }, "P");
    expect(r).toMatchObject({ ok: true, done: true });
    expect(calls).toEqual(["deleteProjectRow"]);
  });

  test("proyecto: si quedan inspecciones tras este paso, no borra el proyecto todavía", async () => {
    const { d } = deps({
      preview: vi.fn(async () => ({ data: preview({ kind: "project", confirm_name: "P" }), error: null })),
      beginScope: vi.fn(async () => ({ data: [A, B], error: null })),
    });
    const r = await runDeletionStep(d, { kind: "project", id: P, projectId: null }, "P");
    expect(r).toEqual({ ok: true, done: false, remaining: 1 });
    expect(d.deleteProjectRow).not.toHaveBeenCalled();
  });

  test("falla de archivos: no cierra filas ni borra el proyecto, y avisa que se puede reintentar", async () => {
    const { d } = deps({
      preview: vi.fn(async () => ({ data: preview({ kind: "project", confirm_name: "P" }), error: null })),
      listObjects: vi.fn(async () => ({ data: ["a/b/c/x.jpg"], error: null })),
      removeObjects: vi.fn(async () => ({ error: { message: "boom" } })),
    });
    const r = await runDeletionStep(d, { kind: "project", id: P, projectId: null }, "P");
    expect(r).toEqual({ ok: false, message: expect.stringContaining("reintent") });
    expect(d.finishOne).not.toHaveBeenCalled();
    expect(d.deleteProjectRow).not.toHaveBeenCalled();
  });

  test("tiempo agotado con archivos pendientes: done:false, sin cerrar filas ni borrar el proyecto", async () => {
    const names = Array.from({ length: 300 }, (_, i) => `o/p/i/${i}.jpg`);
    const store = new Set(names);
    let t = 0;
    const { d } = deps({
      preview: vi.fn(async () => ({ data: preview({ kind: "project", confirm_name: "P", objects: 300 }), error: null })),
      listObjects: vi.fn(async (_id: string, limit: number) => ({ data: [...store].slice(0, limit), error: null })),
      removeObjects: vi.fn(async (paths: string[]) => {
        t += 30000;
        paths.forEach((p) => store.delete(p));
        return { error: null, data: paths.map((name) => ({ name })) };
      }),
      now: () => t,
      budgetMs: 40000,
      concurrency: 1,
    });
    const r = await runDeletionStep(d, { kind: "project", id: P, projectId: null }, "P");
    expect(r).toEqual({ ok: true, done: false, remaining: 1, filesPending: true, objectsLeft: 100 });
    expect(d.finishOne).not.toHaveBeenCalled();
    expect(d.deleteProjectRow).not.toHaveBeenCalled();
  });

  test("un error transitorio al calcular el resumen no se presenta como «ya se eliminó»", async () => {
    const { d } = deps({ preview: vi.fn(async () => ({ data: null, error: { code: "57014", message: "timeout" } })) });
    const r = await runDeletionStep(d, { kind: "inspection", id: A, projectId: null }, "WTG-01");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/eliminó|encontró/);
    expect(r).toEqual({ ok: false, message: expect.stringContaining("Inténtalo de nuevo") });
  });

  test("errores de la base se traducen sin detalles internos", async () => {
    const { d } = deps({ preview: vi.fn(async () => ({ data: null, error: { code: "42501", message: "secret detail" } })) });
    const r = await runDeletionStep(d, { kind: "inspection", id: A, projectId: null }, "WTG-01");
    expect(r).toEqual({ ok: false, message: "No tienes permiso para esta acción." });
  });

  test("un nombre que no existe responde sin filtrar detalles", async () => {
    const { d } = deps({ preview: vi.fn(async () => ({ data: null, error: { code: "P0002", message: "not_found" } })) });
    const r = await runDeletionStep(d, { kind: "inspection", id: A, projectId: null }, "x");
    expect(r).toEqual({ ok: false, message: expect.stringContaining("ya se eliminó") });
    expect(JSON.stringify(r)).not.toContain("not_found");
  });
});
