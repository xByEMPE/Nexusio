import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ requireAdminAction: vi.fn(), createSessionClient: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/inspections/admin-action", () => ({
  requireAdminAction: m.requireAdminAction,
  fail: (message: string) => ({ ok: false, message }),
  dbErrorMessage: (_e: unknown, fb: string) => fb,
}));
vi.mock("@/services/supabase/server", () => ({ createSessionClient: m.createSessionClient }));

import { ASSET_HAS_INSPECTIONS } from "@/lib/inspections/asset-messages";
import { deleteAsset, upsertAsset } from "./catalog";

const ID = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";

function client(opts: { asset?: unknown; count?: number; delError?: { code: string } | null; delRows?: unknown[] }) {
  const del = vi.fn();
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const sb = {
    del,
    upsert,
    from: (t: string) => {
      if (t === "assets")
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.asset ?? null }) }) }),
          delete: () => {
            del();
            return { eq: () => ({ select: async () => ({ data: opts.delRows ?? [{ id: ID }], error: opts.delError ?? null }) }) };
          },
        };
      if (t === "inspections") return { select: () => ({ eq: async () => ({ count: opts.count ?? 0, error: null }) }) };
      if (t === "wind_turbine_specs") return { upsert };
      throw new Error(t);
    },
  };
  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdminAction.mockResolvedValue({ ok: true });
});

describe("deleteAsset", () => {
  const asset = { id: ID, name: "WTG-01", site_id: SITE };
  it("no-admin: rechaza sin tocar la BD", async () => {
    m.requireAdminAction.mockResolvedValue({ error: { ok: false, message: "No tienes permiso para esta acción." } });
    expect(await deleteAsset(ID, "WTG-01")).toMatchObject({ ok: false });
    expect(m.createSessionClient).not.toHaveBeenCalled();
  });
  it("confirmName no string: mensaje limpio sin tocar la BD", async () => {
    expect(await deleteAsset(ID, undefined as unknown as string)).toMatchObject({ ok: false });
    expect(m.createSessionClient).not.toHaveBeenCalled();
  });
  it("exige que el nombre coincida", async () => {
    const sb = client({ asset });
    m.createSessionClient.mockResolvedValue(sb);
    expect(await deleteAsset(ID, "otro")).toMatchObject({ ok: false });
    expect(sb.del).not.toHaveBeenCalled();
  });
  it("con inspecciones: no borra y pide eliminarlas primero", async () => {
    const sb = client({ asset, count: 3 });
    m.createSessionClient.mockResolvedValue(sb);
    expect(await deleteAsset(ID, "WTG-01")).toEqual({ ok: false, message: ASSET_HAS_INSPECTIONS });
    expect(sb.del).not.toHaveBeenCalled();
  });
  it("FK restrict en carrera: mismo mensaje", async () => {
    m.createSessionClient.mockResolvedValue(client({ asset, delError: { code: "23503" } }));
    expect(await deleteAsset(ID, "WTG-01")).toEqual({ ok: false, message: ASSET_HAS_INSPECTIONS });
  });
  it("sin inspecciones: borra y revalida sitio, sitios y portal", async () => {
    const sb = client({ asset });
    m.createSessionClient.mockResolvedValue(sb);
    expect(await deleteAsset(ID, " WTG-01 ")).toEqual({ ok: true });
    expect(sb.del).toHaveBeenCalledOnce();
    const paths = m.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining([`/admin/inspecciones/sitios/${SITE}`, "/admin/inspecciones/sitios", "/portal"]));
  });
});

describe("upsertAsset: Buje fuera de contrato", () => {
  it("no escribe hub_height_m aunque llegue en el formulario", async () => {
    const sb = client({ asset: null });
    const base = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: SITE, organization_id: SITE } }) }) }) };
    m.createSessionClient.mockResolvedValue({
      from: (t: string) =>
        t === "sites"
          ? base
          : t === "assets"
            ? { update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: ID }], error: null }) }) }) }
            : sb.from(t),
    });
    const fd = new FormData();
    fd.set("id", ID);
    fd.set("site_id", SITE);
    fd.set("kind", "wind_turbine");
    fd.set("name", "WTG-01");
    fd.set("blade_length_m", "52");
    fd.set("hub_height_m", "90");
    expect(await upsertAsset(fd)).toEqual({ ok: true });
    const payload = sb.upsert.mock.calls[0]![0];
    expect(payload).not.toHaveProperty("hub_height_m");
    expect(payload.blade_length_m).toBe(52);
  });
});
