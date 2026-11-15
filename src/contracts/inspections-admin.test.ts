import { describe, expect, test } from "vitest";
import { InviteUserSchema, OrganizationInputSchema } from "./inspections-admin";

const ORG = "6f1c0c2e-3b0e-4c8e-9f0a-2d3a4b5c6d7e";

describe("OrganizationInputSchema", () => {
  test("acepta nombre y slug válidos", () => {
    expect(OrganizationInputSchema.safeParse({ name: "Cliente C", slug: "cliente-c" }).success).toBe(true);
  });
  test.each([
    ["slug con mayúsculas", { name: "Cliente C", slug: "Cliente-C" }],
    ["slug con espacios", { name: "Cliente C", slug: "cliente c" }],
    ["slug de un carácter", { name: "Cliente C", slug: "a" }],
    ["nombre corto", { name: "C", slug: "cliente-c" }],
    ["nombre largo", { name: "x".repeat(121), slug: "cliente-c" }],
  ])("rechaza %s", (_n, input) => {
    expect(OrganizationInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("InviteUserSchema", () => {
  test("acepta personal con rol", () => {
    const r = InviteUserSchema.safeParse({ email: "a@b.co", full_name: "Ana Pérez", kind: "staff", platform_role: "technician" });
    expect(r.success).toBe(true);
  });
  test("acepta cliente con organización y rol", () => {
    const r = InviteUserSchema.safeParse({
      email: "a@b.co",
      full_name: "Ana Pérez",
      kind: "client",
      organization_id: ORG,
      member_role: "client_viewer",
    });
    expect(r.success).toBe(true);
  });
  test("rechaza cliente sin organización", () => {
    const r = InviteUserSchema.safeParse({ email: "a@b.co", full_name: "Ana Pérez", kind: "client", member_role: "client_viewer" });
    expect(r.success).toBe(false);
  });
  test("rechaza cliente sin rol de miembro", () => {
    const r = InviteUserSchema.safeParse({ email: "a@b.co", full_name: "Ana Pérez", kind: "client", organization_id: ORG });
    expect(r.success).toBe(false);
  });
  test("rechaza personal sin rol de plataforma", () => {
    expect(InviteUserSchema.safeParse({ email: "a@b.co", full_name: "Ana Pérez", kind: "staff" }).success).toBe(false);
  });
  test("rechaza correo inválido y nombre corto", () => {
    expect(InviteUserSchema.safeParse({ email: "no", full_name: "Ana Pérez", kind: "staff", platform_role: "admin" }).success).toBe(false);
    expect(InviteUserSchema.safeParse({ email: "a@b.co", full_name: "A", kind: "staff", platform_role: "admin" }).success).toBe(false);
  });
});
