import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteUserAccount } from "./delete-user";

const USER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";

const m = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  deleteUser: vi.fn(),
}));

const service = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }),
  auth: { admin: { deleteUser: m.deleteUser } },
} as never;
const sb = { rpc: m.rpc } as never;

const run = (confirmEmail: string | null = "tec@ejemplo.mx", userId = USER) =>
  deleteUserAccount(sb, service, { userId, viewerId: ADMIN, confirmEmail });

beforeEach(() => {
  vi.clearAllMocks();
  m.maybeSingle.mockResolvedValue({ data: { email: "tec@ejemplo.mx" }, error: null });
  m.rpc.mockResolvedValue({ data: { status: "purged" }, error: null });
  m.deleteUser.mockResolvedValue({ data: {}, error: null });
});

describe("deleteUserAccount", () => {
  it("purga OK y Auth OK: elimina, en ese orden (primero la base, luego Auth)", async () => {
    const order: string[] = [];
    m.rpc.mockImplementation(async () => (order.push("rpc"), { data: { status: "purged" }, error: null }));
    m.deleteUser.mockImplementation(async () => (order.push("auth"), { data: {}, error: null }));
    const r = await run();
    expect(r).toEqual({ ok: true, message: "Usuario eliminado. El correo quedó libre para invitarlo de nuevo." });
    expect(order).toEqual(["rpc", "auth"]);
    expect(m.rpc).toHaveBeenCalledWith("admin_delete_user", { p_user_id: USER });
    expect(m.deleteUser).toHaveBeenCalledWith(USER);
  });

  it("no puedes eliminarte a ti mismo: no toca nada", async () => {
    const r = await deleteUserAccount(sb, service, { userId: ADMIN, viewerId: ADMIN, confirmEmail: "x@y.mx" });
    expect(r).toEqual({ ok: false, message: "No puedes eliminar tu propia cuenta." });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.deleteUser).not.toHaveBeenCalled();
  });

  it("el correo escrito no coincide: no purga ni borra", async () => {
    const r = await run("otro@ejemplo.mx");
    expect(r).toEqual({ ok: false, message: "El correo escrito no coincide con el de la cuenta." });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.deleteUser).not.toHaveBeenCalled();
  });

  it("último administrador: la RPC lo rechaza y Auth no se toca", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "last_admin" } });
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toContain("último administrador activo");
    expect(m.deleteUser).not.toHaveBeenCalled();
  });

  it("Auth falla tras la purga: error exacto y reintentable (la purga es idempotente)", async () => {
    m.deleteUser.mockResolvedValueOnce({ data: null, error: { status: 500, code: "unexpected_failure", message: "db down" } });
    const first = await run();
    expect(first.ok).toBe(false);
    expect(first.message).toContain("unexpected_failure: db down");
    expect(first.message).toContain("vuelve a intentarlo");
    // reintento: la purga devuelve «purged» otra vez (cuenta sin acceso todavía) y Auth ahora responde
    const second = await run();
    expect(second.ok).toBe(true);
    expect(m.rpc).toHaveBeenCalledTimes(2);
  });

  it("Auth lanza una excepción de red: se reporta como fallo reintentable", async () => {
    m.deleteUser.mockRejectedValueOnce(new Error("fetch failed"));
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toContain("fetch failed");
  });

  it("perfil inexistente pero usuario de Auth existente: termina de borrarlo", async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: null });
    m.rpc.mockResolvedValue({ data: { status: "profile_missing" }, error: null });
    const r = await run(null);
    expect(r).toEqual({ ok: true, message: "Usuario eliminado. El correo quedó libre para invitarlo de nuevo." });
    expect(m.deleteUser).toHaveBeenCalledWith(USER);
  });

  it("perfil inexistente y Auth ya sin usuario: idempotente", async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: null });
    m.rpc.mockResolvedValue({ data: { status: "profile_missing" }, error: null });
    m.deleteUser.mockResolvedValue({ data: null, error: { status: 404, code: "user_not_found", message: "User not found" } });
    const r = await run(null);
    expect(r).toEqual({ ok: true, message: "La cuenta ya estaba eliminada." });
  });

  it("no se pudo consultar el perfil: no se hace nada", async () => {
    m.maybeSingle.mockResolvedValue({ data: null, error: { message: "x" } });
    const r = await run();
    expect(r).toEqual({ ok: false, message: "No se pudo consultar la cuenta." });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
