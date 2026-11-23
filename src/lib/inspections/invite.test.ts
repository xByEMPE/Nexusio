import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteUserInput } from "@/contracts/inspections-admin";
import { inviteWithAccess } from "./invite";

const m = vi.hoisted(() => ({
  profile: vi.fn(),
  members: vi.fn(),
  getUserById: vi.fn(),
  inviteUserByEmail: vi.fn(),
  deleteUser: vi.fn(),
  reset: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  profileUpdates: [] as unknown[],
}));

const service = {
  from: (table: string) =>
    table === "profiles"
      ? { select: () => ({ eq: () => ({ maybeSingle: m.profile }) }) }
      : { select: () => ({ eq: m.members }) },
  auth: { admin: { getUserById: m.getUserById, inviteUserByEmail: m.inviteUserByEmail, deleteUser: m.deleteUser } },
} as never;
const sb = {
  from: (table: string) =>
    table === "profiles"
      ? { update: (v: unknown) => (m.profileUpdates.push(v), { eq: () => ({ select: m.update }) }) }
      : { insert: m.insert },
} as never;
const anon = { auth: { resetPasswordForEmail: m.reset } } as never;

const ORPHAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const staff: InviteUserInput = { email: "Tec@Ejemplo.mx", full_name: "Tec Uno", kind: "staff", platform_role: "technician" };
const client: InviteUserInput = { email: "cli@ejemplo.mx", full_name: "Cli Uno", kind: "client", organization_id: ORG, member_role: "client_viewer" };

let seq = 0;
const freshId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

beforeEach(() => {
  vi.clearAllMocks();
  m.profileUpdates.length = 0;
  m.profile.mockResolvedValue({ data: null, error: null });
  m.members.mockResolvedValue({ data: [], error: null });
  m.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  m.deleteUser.mockResolvedValue({ error: null });
  m.update.mockResolvedValue({ data: [{ id: "x" }], error: null });
  m.insert.mockResolvedValue({ error: null });
  m.getUserById.mockResolvedValue({ data: { user: { id: ORPHAN, email_confirmed_at: null, invited_at: null } }, error: null });
  m.reset.mockResolvedValue({ error: null });
});

describe("inviteWithAccess: correo existente", () => {
  it("correo nuevo: invita y asigna el acceso como antes", async () => {
    const r = await inviteWithAccess(service, sb, staff);
    expect(r).toEqual({ ok: true, userId: "new-user" });
    expect(m.inviteUserByEmail).toHaveBeenCalledWith("Tec@Ejemplo.mx", { data: { full_name: "Tec Uno" } });
  });

  it("busca la cuenta con el correo en minúsculas", async () => {
    const eq = vi.fn(() => ({ maybeSingle: m.profile }));
    const svc = { ...(service as object), from: () => ({ select: () => ({ eq }) }) } as never;
    await inviteWithAccess(svc, sb, staff);
    expect(eq).toHaveBeenCalledWith("email", "tec@ejemplo.mx");
  });

  it("cuenta huérfana de cliente: la reutiliza (reactiva, asigna la membresía) y reenvía la invitación", async () => {
    const id = freshId();
    m.profile.mockResolvedValue({ data: { id, full_name: null, is_active: false, platform_role: null }, error: null });
    const r = await inviteWithAccess(service, sb, client, anon);
    expect(r.ok).toBe(true);
    expect(r.ok && r.reused).toBe(true);
    expect(r.ok && r.userId).toBe(id);
    expect(r.ok && r.message).toContain("Se envió un enlace de acceso a cli@ejemplo.mx");
    expect(m.profileUpdates[0]).toEqual({ is_active: true, full_name: "Cli Uno" });
    expect(m.insert).toHaveBeenCalledWith({ organization_id: ORG, user_id: id, role: "client_viewer" });
    expect(m.inviteUserByEmail).toHaveBeenCalledWith("cli@ejemplo.mx", { data: { full_name: "Cli Uno" } });
  });

  it("cuenta huérfana de personal: asigna el rol y reactiva en una sola actualización", async () => {
    const id = freshId();
    m.profile.mockResolvedValue({ data: { id, full_name: "Tec", is_active: true, platform_role: null }, error: null });
    const r = await inviteWithAccess(service, sb, staff, anon);
    expect(r.ok && r.reused).toBe(true);
    expect(m.profileUpdates[0]).toEqual({ platform_role: "technician", is_active: true, full_name: "Tec Uno" });
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("huérfana ya confirmada: manda la recuperación (no una invitación)", async () => {
    const id = freshId();
    m.profile.mockResolvedValue({ data: { id, full_name: "Tec", is_active: true, platform_role: null }, error: null });
    m.getUserById.mockResolvedValue({ data: { user: { id, email_confirmed_at: "2026-11-01T00:00:00Z", invited_at: null } }, error: null });
    const r = await inviteWithAccess(service, sb, staff, anon);
    expect(r.ok && r.message).toContain("Se envió un enlace de acceso");
    expect(m.reset).toHaveBeenCalledWith("tec@ejemplo.mx");
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("huérfana: si se envió un enlace hace poco, asigna el acceso pero no reenvía", async () => {
    const id = freshId();
    m.profile.mockResolvedValue({ data: { id, full_name: null, is_active: true, platform_role: null }, error: null });
    m.getUserById.mockResolvedValue({ data: { user: { id, email_confirmed_at: null, invited_at: new Date().toISOString() } }, error: null });
    const r = await inviteWithAccess(service, sb, client, anon);
    expect(r.ok).toBe(true);
    expect(r.ok && r.message).toContain("espera unos minutos");
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("huérfana: si la asignación falla, no envía nada y avisa", async () => {
    const id = freshId();
    m.profile.mockResolvedValue({ data: { id, full_name: null, is_active: true, platform_role: null }, error: null });
    m.insert.mockResolvedValue({ error: { code: "42501" } });
    const r = await inviteWithAccess(service, sb, client, anon);
    expect(r).toEqual({ ok: false, message: "No se pudo asignar el acceso a la cuenta existente. Intenta de nuevo." });
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("existe con acceso activo (personal): dice dónde está y no invita", async () => {
    m.profile.mockResolvedValue({ data: { id: freshId(), full_name: "Tec", is_active: true, platform_role: "admin" }, error: null });
    const r = await inviteWithAccess(service, sb, staff, anon);
    expect(r).toEqual({ ok: false, message: "Ya existe una cuenta activa con ese correo: es personal de NEXUS (Administrador)." });
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("existe con acceso activo (cliente): nombra la organización", async () => {
    m.profile.mockResolvedValue({ data: { id: freshId(), full_name: "Cli", is_active: true, platform_role: null }, error: null });
    m.members.mockResolvedValue({ data: [{ role: "client_manager", organizations: { name: "Eólica Norte" } }], error: null });
    const r = await inviteWithAccess(service, sb, client, anon);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toBe("Ya existe una cuenta activa con ese correo: es miembro de la organización «Eólica Norte» (Gerente).");
  });

  it("existe inactiva con acceso: ofrece activarla", async () => {
    m.profile.mockResolvedValue({ data: { id: freshId(), full_name: "Tec", is_active: false, platform_role: "technician" }, error: null });
    const r = await inviteWithAccess(service, sb, staff, anon);
    expect(!r.ok && r.message).toContain("Actívala desde Usuarios");
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("no se pudo consultar la cuenta: no invita a ciegas", async () => {
    m.profile.mockResolvedValue({ data: null, error: { message: "x" } });
    const r = await inviteWithAccess(service, sb, staff, anon);
    expect(r).toEqual({ ok: false, message: "No se pudo comprobar si el correo ya existe. Intenta de nuevo." });
    expect(m.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("alta nueva con asignación fallida: revierte la cuenta creada", async () => {
    m.insert.mockResolvedValue({ error: { code: "42501" } });
    const r = await inviteWithAccess(service, sb, client);
    expect(r.ok).toBe(false);
    expect(m.deleteUser).toHaveBeenCalledWith("new-user");
  });
});
