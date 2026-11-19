import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  createServiceClient: vi.fn(),
  createAnonClient: vi.fn(),
  createSessionClient: vi.fn(),
  maybeSingle: vi.fn(),
  getUserById: vi.fn(),
  inviteUserByEmail: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  from: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/inspections/admin-action", () => ({
  requireAdminAction: m.requireAdminAction,
  dbErrorMessage: (_e: unknown, fb: string) => fb,
  fail: (message: string) => ({ ok: false, message }),
}));
vi.mock("@/lib/inspections/invite", () => ({ inviteWithAccess: vi.fn() }));
vi.mock("@/services/supabase/server", () => ({
  createServiceClient: m.createServiceClient,
  createAnonClient: m.createAnonClient,
  createSessionClient: m.createSessionClient,
}));

const ID = "11111111-1111-4111-8111-111111111111";
const fd = (id: string | null = ID) => {
  const f = new FormData();
  if (id !== null) f.set("user_id", id);
  return f;
};
const NOW = Date.parse("2026-11-18T12:00:00Z");

async function load() {
  vi.resetModules();
  return (await import("./users")).resendAccess;
}

const authUser = (over: Record<string, unknown> = {}) => ({
  data: { user: { id: ID, email: "tec@ejemplo.mx", email_confirmed_at: "2026-11-01T00:00:00Z", invited_at: "2026-11-01T00:00:00Z", ...over } },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  m.requireAdminAction.mockResolvedValue({ viewer: { user: { id: "admin" } } });
  m.maybeSingle.mockResolvedValue({ data: { id: ID, email: "tec@ejemplo.mx", full_name: "Tec Uno", is_active: true }, error: null });
  m.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) });
  m.getUserById.mockResolvedValue(authUser());
  m.inviteUserByEmail.mockResolvedValue({ data: { user: { id: ID } }, error: null });
  m.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  m.createServiceClient.mockReturnValue({ from: m.from, auth: { admin: { getUserById: m.getUserById, inviteUserByEmail: m.inviteUserByEmail } } });
  m.createAnonClient.mockReturnValue({ auth: { resetPasswordForEmail: m.resetPasswordForEmail } });
});

describe("resendAccess", () => {
  it("no-admin: rechaza ANTES de leer nada", async () => {
    m.requireAdminAction.mockResolvedValue({ error: { ok: false, message: "No tienes permiso para esta acción." } });
    const act = await load();
    expect(await act(fd())).toEqual({ ok: false, message: "No tienes permiso para esta acción." });
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.createAnonClient).not.toHaveBeenCalled();
    expect(m.from).not.toHaveBeenCalled();
  });
  it("id inválido: solicitud no válida sin tocar la base", async () => {
    const act = await load();
    expect(await act(fd("no-uuid"))).toEqual({ ok: false, message: "Solicitud no válida." });
    expect(await act(fd(null))).toEqual({ ok: false, message: "Solicitud no válida." });
    expect(m.from).not.toHaveBeenCalled();
  });
  it("cuenta sin confirmar: reenvía la invitación (misma cuenta) y no manda recuperación", async () => {
    m.getUserById.mockResolvedValue(authUser({ email_confirmed_at: null }));
    const act = await load();
    expect(await act(fd())).toEqual({ ok: true, message: "Se envió un enlace de acceso a tec@ejemplo.mx." });
    expect(m.inviteUserByEmail).toHaveBeenCalledWith("tec@ejemplo.mx", { data: { full_name: "Tec Uno" } });
    expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("cuenta confirmada: envía recuperación con el cliente anónimo y no invita", async () => {
    const act = await load();
    expect(await act(fd())).toEqual({ ok: true, message: "Se envió un enlace de acceso a tec@ejemplo.mx." });
    expect(m.resetPasswordForEmail).toHaveBeenCalledWith("tec@ejemplo.mx");
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });
  it("cuenta inactiva: mensaje claro y no envía nada", async () => {
    m.maybeSingle.mockResolvedValue({ data: { id: ID, email: "tec@ejemplo.mx", full_name: "T", is_active: false }, error: null });
    const act = await load();
    const r = await act(fd());
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("inactiva") });
    expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });
  it("enfriamiento por marca de Supabase (recovery_sent_at hace 1 min): no envía", async () => {
    m.getUserById.mockResolvedValue(authUser({ recovery_sent_at: new Date(NOW - 60_000).toISOString() }));
    const act = await load();
    expect(await act(fd())).toMatchObject({ ok: false, message: expect.stringContaining("espera") });
    expect(m.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("enfriamiento en memoria: un segundo envío inmediato se rechaza", async () => {
    const act = await load();
    expect((await act(fd())).ok).toBe(true);
    const second = await act(fd());
    expect(second).toMatchObject({ ok: false, message: expect.stringContaining("espera") });
    expect(m.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });
  it("cuenta inexistente: no se encontró", async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: null });
    const act = await load();
    expect(await act(fd())).toEqual({ ok: false, message: "No se encontró la cuenta." });
  });
  it("error de Supabase: mensaje genérico sin detalles internos", async () => {
    m.resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure", message: "SMTP password invalid for smtp.x" } });
    const act = await load();
    const r = await act(fd());
    expect(r).toEqual({ ok: false, message: "No se pudo enviar el enlace. Inténtalo de nuevo más tarde." });
  });
  it("límite de tasa de Supabase: mensaje de espera", async () => {
    m.resetPasswordForEmail.mockResolvedValue({ data: null, error: { status: 429, code: "over_email_send_rate_limit", message: "x" } });
    const act = await load();
    expect(await act(fd())).toEqual({ ok: false, message: "Demasiados intentos; espera unos minutos." });
  });
  it("sin servicio configurado: mensaje de configuración", async () => {
    m.createServiceClient.mockReturnValue(null);
    const act = await load();
    expect(await act(fd())).toEqual({ ok: false, message: "El servicio no está configurado." });
  });
});
