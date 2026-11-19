import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  createSessionClient: vi.fn(),
  createServiceClient: vi.fn(),
  runDeletionStep: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/inspections/admin-action", () => ({
  requireAdminAction: m.requireAdminAction,
  dbErrorMessage: (_e: unknown, fb: string) => fb,
}));
vi.mock("@/services/supabase/server", () => ({
  createSessionClient: m.createSessionClient,
  createServiceClient: m.createServiceClient,
}));
vi.mock("@/services/inspections/deletion-flow", () => ({ runDeletionStep: m.runDeletionStep }));

import { deleteAssetInspections, deleteInspection, deleteProject, previewDeletion } from "./deletion";

const ID = "11111111-1111-4111-8111-111111111111";
const OFF = "El borrado está desactivado en este entorno.";

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdminAction.mockResolvedValue({ ok: true });
  m.createSessionClient.mockResolvedValue({ rpc: m.rpc });
  m.createServiceClient.mockReturnValue({ storage: {} });
  m.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  m.runDeletionStep.mockResolvedValue({ ok: true, done: true });
});
afterEach(() => vi.unstubAllEnvs());

const calls = {
  inspection: () => deleteInspection(ID, "x"),
  asset: () => deleteAssetInspections(ID, null, "x"),
  project: () => deleteProject(ID, "x"),
  preview: () => previewDeletion("inspection", ID, null),
};

describe("borrado desactivado (INSPECTIONS_DELETE_ENABLED=false)", () => {
  beforeEach(() => vi.stubEnv("INSPECTIONS_DELETE_ENABLED", "false"));

  for (const [name, call] of Object.entries(calls)) {
    it(`${name}: rechaza con mensaje y no toca nada`, async () => {
      const r = await call();
      expect(r).toMatchObject({ ok: false, message: OFF });
      expect(m.createSessionClient).not.toHaveBeenCalled();
      expect(m.createServiceClient).not.toHaveBeenCalled();
      expect(m.runDeletionStep).not.toHaveBeenCalled();
      expect(m.rpc).not.toHaveBeenCalled();
    });
  }

  it("un no-admin sigue recibiendo el rechazo de permiso (admin se comprueba antes)", async () => {
    m.requireAdminAction.mockResolvedValue({ error: "x" });
    expect(await deleteProject(ID, "x")).toMatchObject({ ok: false, message: "No tienes permiso para esta acción." });
  });
});

describe("borrado activo (por defecto)", () => {
  it("ejecuta el paso de borrado igual que antes", async () => {
    const r = await deleteInspection(ID, "Nombre");
    expect(r).toEqual({ ok: true, done: true });
    expect(m.runDeletionStep).toHaveBeenCalledTimes(1);
  });
  it("la vista previa consulta la base", async () => {
    const r = await previewDeletion("inspection", ID, null);
    expect(r.ok).toBe(true);
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("valores no reconocidos mantienen activo", async () => {
    vi.stubEnv("INSPECTIONS_DELETE_ENABLED", "quizás");
    await deleteProject(ID, "Nombre");
    expect(m.runDeletionStep).toHaveBeenCalledTimes(1);
  });
});
