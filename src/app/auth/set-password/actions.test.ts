import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  resolveLoginDestination: vi.fn(),
}));

vi.mock("@/services/supabase/server", () => ({
  createSessionClient: async () => ({ auth: { getUser: m.getUser, updateUser: m.updateUser } }),
}));
vi.mock("@/app/admin/login/actions", () => ({ resolveLoginDestination: m.resolveLoginDestination }));
vi.mock("@/lib/inspections/flag", () => ({ inspectionsEnabled: () => true }));

import { setPassword } from "./actions";

const GOOD = "Clave-Segura-2026!";

beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  m.updateUser.mockResolvedValue({ error: null });
  m.resolveLoginDestination.mockResolvedValue({ path: "/portal" });
});

describe("setPassword (invitación y recuperación)", () => {
  it("con sesión (también de recuperación): actualiza y devuelve el destino por rol", async () => {
    expect(await setPassword(GOOD)).toEqual({ path: "/portal" });
    expect(m.updateUser).toHaveBeenCalledWith({ password: GOOD });
  });
  it("contraseña débil: rechaza sin tocar Supabase", async () => {
    expect(await setPassword("corta")).toEqual({ error: "Mínimo 12 caracteres." });
    expect(m.updateUser).not.toHaveBeenCalled();
  });
  it("sin sesión: pide un enlace nuevo", async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });
    expect(await setPassword(GOOD)).toEqual({ error: "El enlace venció. Pide uno nuevo." });
    expect(m.updateUser).not.toHaveBeenCalled();
  });
  it("perfil inactivo o sin acceso: mensaje de cuenta sin acceso y NO cambia la contraseña", async () => {
    m.resolveLoginDestination.mockResolvedValue({ error: "forbidden" });
    expect(await setPassword(GOOD)).toEqual({ error: "Esta cuenta no tiene acceso." });
    expect(m.updateUser).not.toHaveBeenCalled();
  });
  it("error de Supabase al guardar: mensaje genérico", async () => {
    m.updateUser.mockResolvedValue({ error: { message: "interno" } });
    expect(await setPassword(GOOD)).toEqual({ error: "No se pudo guardar la contraseña. Inténtalo de nuevo." });
  });
});
