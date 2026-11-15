import { describe, expect, it } from "vitest";
import { clientCapabilities, staffCapabilities } from "./capabilities";

const org = "11111111-1111-4111-8111-111111111111";

describe("capacidades del visor", () => {
  it("admin: todo menos marcar revisado, también aprobada", () => {
    expect(staffCapabilities({ platformRole: "admin", memberships: [] }, true)).toEqual({
      editFindings: true,
      deleteFindings: true,
      comment: true,
      review: false,
      history: true,
    });
  });
  it("técnico: edita solo si no está aprobada, nunca borra", () => {
    const t = { platformRole: "technician" as const, memberships: [] };
    expect(staffCapabilities(t, false)).toMatchObject({ editFindings: true, deleteFindings: false, history: true });
    expect(staffCapabilities(t, true).editFindings).toBe(false);
  });
  it("cuenta de servicio o sin rol: nada", () => {
    expect(Object.values(staffCapabilities({ platformRole: "service", memberships: [] }, false)).some(Boolean)).toBe(false);
  });
  it("cliente responsable de la organización comenta y revisa; lector y otra organización no", () => {
    expect(clientCapabilities({ platformRole: null, memberships: [{ organizationId: org, role: "client_manager" }] }, org)).toEqual({
      editFindings: false,
      deleteFindings: false,
      comment: true,
      review: true,
      history: false,
    });
    expect(clientCapabilities({ platformRole: null, memberships: [{ organizationId: org, role: "client_viewer" }] }, org).comment).toBe(false);
    expect(clientCapabilities({ platformRole: null, memberships: [{ organizationId: "x", role: "client_manager" }] }, org).review).toBe(false);
  });
});
