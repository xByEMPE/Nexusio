import { describe, expect, test, vi } from "vitest";
import { purgeObjects, runInspectionDeletion, type DeletionDeps } from "./deletion";

/** Almacén falso: guarda nombres, `list` devuelve los primeros N y `remove` los quita. */
function fakeStore(names: string[], opts: { failTimes?: number; ghost?: Set<string>; alreadyGone?: Set<string> } = {}) {
  const store = new Set(names);
  let failures = opts.failTimes ?? 0;
  const batches: string[][] = [];
  const list = vi.fn(async (limit: number) => [...store].slice(0, limit));
  const remove = vi.fn(async (paths: string[]) => {
    batches.push(paths);
    if (failures > 0) {
      failures -= 1;
      return { error: { message: "timeout" } };
    }
    for (const p of paths) if (!opts.ghost?.has(p)) store.delete(p);
    return { error: null };
  });
  return { store, list, remove, batches };
}

const noSleep = async () => {};

describe("purgeObjects", () => {
  test("borra en lotes de 100 como máximo, incluso con miles de objetos", async () => {
    const names = Array.from({ length: 2350 }, (_, i) => `o/p/i/captures/${i}/original.jpg`);
    const s = fakeStore(names);
    const r = await purgeObjects({ list: s.list, remove: s.remove, sleep: noSleep });
    expect(r).toMatchObject({ ok: true, removed: 2350 });
    expect(Math.max(...s.batches.map((b) => b.length))).toBe(100);
    expect(s.batches.reduce((n, b) => n + b.length, 0)).toBe(2350);
    expect(s.store.size).toBe(0);
  });

  test("sin objetos no llama a remove", async () => {
    const s = fakeStore([]);
    const r = await purgeObjects({ list: s.list, remove: s.remove, sleep: noSleep });
    expect(r).toEqual({ ok: true, removed: 0 });
    expect(s.remove).not.toHaveBeenCalled();
  });

  test("reintenta ante un error transitorio y sigue", async () => {
    const s = fakeStore(["a", "b", "c"], { failTimes: 2 });
    const sleep = vi.fn(noSleep);
    const r = await purgeObjects({ list: s.list, remove: s.remove, sleep, retries: 3 });
    expect(r).toMatchObject({ ok: true, removed: 3 });
    expect(s.remove).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test("si el error persiste, informa el fallo sin detalles internos y deja el resto", async () => {
    const s = fakeStore(["a", "b"], { failTimes: 99 });
    const r = await purgeObjects({ list: s.list, remove: s.remove, sleep: noSleep, retries: 2 });
    expect(r.ok).toBe(false);
    expect(s.remove).toHaveBeenCalledTimes(3);
    expect(s.store.size).toBe(2);
  });

  test("es idempotente: un objeto que ya no existe no es un fallo", async () => {
    const remove = vi.fn(async () => ({ error: { message: "Object not found", statusCode: "404" } }));
    let calls = 0;
    const list = vi.fn(async () => (calls++ === 0 ? ["a"] : []));
    const r = await purgeObjects({ list, remove, sleep: noSleep });
    expect(r.ok).toBe(true);
  });

  test("si Storage dice que borró pero el objeto sigue, se detiene sin bucle infinito", async () => {
    const s = fakeStore(["a", "b"], { ghost: new Set(["a", "b"]) });
    const r = await purgeObjects({ list: s.list, remove: s.remove, sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(s.remove.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

function deps(over: Partial<DeletionDeps> & { names?: string[] } = {}) {
  const s = fakeStore(over.names ?? ["a", "b"]);
  const d: DeletionDeps = {
    begin: vi.fn(async () => {}),
    list: s.list,
    remove: s.remove,
    finish: vi.fn(async () => ({ status: "deleted" })),
    sleep: noSleep,
    ...over,
  };
  return { d, s };
}

describe("runInspectionDeletion", () => {
  test("marca, borra archivos y al final cierra las filas, en ese orden", async () => {
    const { d } = deps();
    const order: string[] = [];
    d.begin = vi.fn(async () => void order.push("begin"));
    d.remove = vi.fn(async () => (order.push("remove"), { error: null }));
    let n = 0;
    d.list = vi.fn(async () => (n++ === 0 ? ["a"] : []));
    d.finish = vi.fn(async () => (order.push("finish"), { status: "deleted" }));
    const r = await runInspectionDeletion(d);
    expect(r).toEqual({ ok: true, removed: 1 });
    expect(order).toEqual(["begin", "remove", "finish"]);
  });

  test("no llama a finish si fallan los archivos", async () => {
    const s = fakeStore(["a"], { failTimes: 99 });
    const { d } = deps({ list: s.list, remove: s.remove, retries: 1 });
    const r = await runInspectionDeletion(d);
    expect(r).toMatchObject({ ok: false, stage: "files" });
    expect(d.finish).not.toHaveBeenCalled();
  });

  test("no llama a finish si tras borrar aún quedan objetos", async () => {
    const s = fakeStore(["a"], { ghost: new Set(["a"]) });
    const { d } = deps({ list: s.list, remove: s.remove });
    const r = await runInspectionDeletion(d);
    expect(r).toMatchObject({ ok: false, stage: "files" });
    expect(d.finish).not.toHaveBeenCalled();
  });

  test("un error al marcar no toca nada", async () => {
    const { d, s } = deps({ begin: vi.fn(async () => { throw new Error("x"); }) });
    const r = await runInspectionDeletion(d);
    expect(r).toMatchObject({ ok: false, stage: "begin" });
    expect(s.remove).not.toHaveBeenCalled();
    expect(d.finish).not.toHaveBeenCalled();
  });

  test("un error al cerrar las filas queda reportado como fallo de filas (reintentable)", async () => {
    const { d } = deps({ finish: vi.fn(async () => { throw { code: "P0001" }; }) });
    const r = await runInspectionDeletion(d);
    expect(r).toMatchObject({ ok: false, stage: "rows" });
  });
});
