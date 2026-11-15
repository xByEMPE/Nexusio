import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { homePathFor } from "./viewer";

describe("homePathFor", () => {
  it("administración por correo sin rol de plataforma entra al panel de solicitudes", () => {
    expect(homePathFor({ platformRole: null, memberships: [], isAdminEmail: true }, true)).toBe("/admin");
  });
  it("admin y técnico entran a inspecciones", () => {
    expect(homePathFor({ platformRole: "admin", memberships: [], isAdminEmail: false }, true)).toBe("/admin/inspecciones");
    expect(homePathFor({ platformRole: "technician", memberships: [], isAdminEmail: false }, true)).toBe("/admin/inspecciones");
  });
  it("service no tiene acceso", () => {
    expect(homePathFor({ platformRole: "service", memberships: [], isAdminEmail: false }, true)).toBeNull();
  });
  it("cliente con membresía entra al portal", () => {
    expect(
      homePathFor({ platformRole: null, memberships: [{ organizationId: "o", role: "client_viewer" }], isAdminEmail: false }, true),
    ).toBe("/portal");
  });
  it("sin rol ni membresía no tiene acceso", () => {
    expect(homePathFor({ platformRole: null, memberships: [], isAdminEmail: false }, true)).toBeNull();
  });
  it("con inspecciones desactivadas solo queda el panel de solicitudes", () => {
    expect(homePathFor({ platformRole: "technician", memberships: [], isAdminEmail: true }, false)).toBe("/admin");
    expect(
      homePathFor({ platformRole: null, memberships: [{ organizationId: "o", role: "client_manager" }], isAdminEmail: false }, false),
    ).toBeNull();
  });
});
