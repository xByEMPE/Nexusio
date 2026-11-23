import { describe, expect, it } from "vitest";
import {
  decideInvite,
  deleteUserErrorMessage,
  describeAccess,
  emailMatches,
  isOrphanAccount,
  selfDeleteMessage,
  type ExistingAccount,
} from "./account-status";

const acc = (over: Partial<ExistingAccount> = {}): ExistingAccount => ({
  id: "11111111-1111-4111-8111-111111111111",
  isActive: true,
  platformRole: null,
  memberships: [],
  ...over,
});

describe("cuenta huérfana", () => {
  it("sin rol y sin membresías es huérfana; con cualquiera de los dos, no", () => {
    expect(isOrphanAccount(acc())).toBe(true);
    expect(isOrphanAccount(acc({ platformRole: "technician" }))).toBe(false);
    expect(isOrphanAccount(acc({ memberships: [{ organizationName: "Acme", role: "client_viewer" }] }))).toBe(false);
  });
});

describe("decideInvite", () => {
  it("sin cuenta: crear", () => {
    expect(decideInvite(null)).toEqual({ kind: "create" });
  });
  it("huérfana: reutilizar, esté activa o no", () => {
    expect(decideInvite(acc())).toEqual({ kind: "reuse" });
    expect(decideInvite(acc({ isActive: false }))).toEqual({ kind: "reuse" });
  });
  it("personal activo: dice que es personal y su rol", () => {
    const d = decideInvite(acc({ platformRole: "technician" }));
    expect(d.kind).toBe("stop");
    expect(d.kind === "stop" && d.message).toBe("Ya existe una cuenta activa con ese correo: es personal de NEXUS (Técnico).");
  });
  it("cliente activo: nombra la organización y el rol", () => {
    const d = decideInvite(acc({ memberships: [{ organizationName: "Eólica Norte", role: "client_manager" }] }));
    expect(d.kind === "stop" && d.message).toBe(
      "Ya existe una cuenta activa con ese correo: es miembro de la organización «Eólica Norte» (Gerente).",
    );
  });
  it("cuenta inactiva con acceso: ofrece activarla en Usuarios", () => {
    const d = decideInvite(acc({ isActive: false, memberships: [{ organizationName: "Acme", role: "client_viewer" }] }));
    expect(d.kind === "stop" && d.message).toContain("cuenta inactiva");
    expect(d.kind === "stop" && d.message).toContain("Actívala desde Usuarios");
    expect(d.kind === "stop" && d.message).toContain("«Acme»");
  });
  it("varias organizaciones: las lista en plural", () => {
    const text = describeAccess({
      platformRole: null,
      memberships: [
        { organizationName: "A", role: "client_viewer" },
        { organizationName: "B", role: "client_manager" },
      ],
    });
    expect(text).toBe("es miembro de las organizaciones «A» (Lector), «B» (Gerente)");
  });
});

describe("confirmación y errores de eliminación", () => {
  it("el correo escrito debe coincidir sin distinguir mayúsculas ni espacios", () => {
    expect(emailMatches(" Tec@Ejemplo.mx ", "tec@ejemplo.mx")).toBe(true);
    expect(emailMatches("otro@ejemplo.mx", "tec@ejemplo.mx")).toBe(false);
    expect(emailMatches("", "")).toBe(false);
    expect(emailMatches(null, "tec@ejemplo.mx")).toBe(false);
  });
  it("no puedes eliminar tu propia cuenta", () => {
    expect(selfDeleteMessage("a", "a")).toBe("No puedes eliminar tu propia cuenta.");
    expect(selfDeleteMessage("a", "b")).toBeNull();
  });
  it("traduce los códigos de la función SQL", () => {
    expect(deleteUserErrorMessage({ code: "P0001", message: "last_admin" })).toContain("último administrador activo");
    expect(deleteUserErrorMessage({ code: "P0001", message: "cannot_delete_self" })).toBe("No puedes eliminar tu propia cuenta.");
    expect(deleteUserErrorMessage({ code: "42501", message: "not_allowed" })).toBe("No tienes permiso para esta acción.");
    expect(deleteUserErrorMessage({ message: "boom" })).toBe("No se pudieron borrar los datos de la cuenta. Inténtalo de nuevo.");
  });
});
