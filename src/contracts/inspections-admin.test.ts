import { describe, expect, test } from "vitest";
import {
  AssetInputSchema,
  AssignmentSchema,
  FieldProjectSchema,
  InspectionInputSchema,
  InviteUserSchema,
  OrganizationInputSchema,
  ProjectInputSchema,
  SiteInputSchema,
} from "./inspections-admin";

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

describe("SiteInputSchema", () => {
  const base = { organization_id: ORG, kind: "wind_farm", name: "Parque Norte" };
  test("acepta un sitio válido con y sin coordenadas", () => {
    expect(SiteInputSchema.safeParse(base).success).toBe(true);
    expect(SiteInputSchema.safeParse({ ...base, lat: 19.4, lon: -99.1 }).success).toBe(true);
  });
  test.each([
    ["latitud fuera de rango", { ...base, lat: 91 }],
    ["longitud fuera de rango", { ...base, lon: -181 }],
    ["nombre corto", { ...base, name: "P" }],
    ["tipo desconocido", { ...base, kind: "otro" }],
  ])("rechaza %s", (_n, input) => {
    expect(SiteInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("AssetInputSchema", () => {
  const base = { site_id: ORG, kind: "wind_turbine", name: "WTG-01" };
  test("acepta un activo con turbina", () => {
    const r = AssetInputSchema.safeParse({ ...base, turbine: { manufacturer: "Vestas", blade_length_m: 52, rotor_diameter_m: 110, hub_height_m: 90 } });
    expect(r.success).toBe(true);
  });
  test("rechaza blade_length_m = 0", () => {
    expect(AssetInputSchema.safeParse({ ...base, turbine: { blade_length_m: 0 } }).success).toBe(false);
  });
  test("rechaza medidas fuera de rango", () => {
    expect(AssetInputSchema.safeParse({ ...base, turbine: { blade_length_m: 151 } }).success).toBe(false);
    expect(AssetInputSchema.safeParse({ ...base, turbine: { rotor_diameter_m: 301 } }).success).toBe(false);
    expect(AssetInputSchema.safeParse({ ...base, turbine: { hub_height_m: 251 } }).success).toBe(false);
  });
  test("rechaza nombre vacío o de más de 60", () => {
    expect(AssetInputSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(AssetInputSchema.safeParse({ ...base, name: "x".repeat(61) }).success).toBe(false);
  });
});

describe("ProjectInputSchema", () => {
  const base = { organization_id: ORG, name: "Inspección 2026", status: "planned", contacts: [] };
  test("acepta fechas en orden y misma fecha", () => {
    expect(ProjectInputSchema.safeParse({ ...base, start_date: "2026-03-01", end_date: "2026-03-10" }).success).toBe(true);
    expect(ProjectInputSchema.safeParse({ ...base, start_date: "2026-03-01", end_date: "2026-03-01" }).success).toBe(true);
  });
  test("rechaza end_date < start_date", () => {
    expect(ProjectInputSchema.safeParse({ ...base, start_date: "2026-03-10", end_date: "2026-03-01" }).success).toBe(false);
  });
  test("rechaza más de 20 contactos y contactos sin nombre", () => {
    const c = { role: "Cliente", name: "Ana" };
    expect(ProjectInputSchema.safeParse({ ...base, contacts: Array.from({ length: 21 }, () => c) }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, contacts: [{ role: "Cliente", name: "" }] }).success).toBe(false);
    expect(ProjectInputSchema.safeParse({ ...base, contacts: [{ ...c, email: "no" }] }).success).toBe(false);
  });
  test("rechaza estado desconocido", () => {
    expect(ProjectInputSchema.safeParse({ ...base, status: "x" }).success).toBe(false);
  });
});

describe("AssignmentSchema e InspectionInputSchema", () => {
  test("validan uuid y tipo", () => {
    expect(AssignmentSchema.safeParse({ project_id: ORG, user_id: ORG }).success).toBe(true);
    expect(AssignmentSchema.safeParse({ project_id: "x", user_id: ORG }).success).toBe(false);
    expect(InspectionInputSchema.safeParse({ project_id: ORG, asset_id: ORG, kind: "wind_blade" }).success).toBe(true);
    expect(InspectionInputSchema.safeParse({ project_id: ORG, asset_id: ORG, kind: "otro" }).success).toBe(false);
  });
});

describe("FieldProjectSchema", () => {
  const SITE = "7f1c0c2e-3b0e-4c8e-9f0a-2d3a4b5c6d7e";
  const valid = () => ({
    org: { mode: "new" as const, name: "Cliente Z", slug: "cliente-z" },
    site: { mode: "new" as const, name: "Parque Z", kind: "wind_farm" as const },
    turbines: [{ name: "WTG-01" }, { name: "WTG-02", code: "B2", lat: 10, lon: 20 }],
    project: { name: "Campaña 2026", status: "in_field" as const },
    technician: { email: "tec@ejemplo.com" },
  });
  test("acepta organización y sitio nuevos", () => {
    expect(FieldProjectSchema.safeParse(valid()).success).toBe(true);
  });
  test("acepta organización y sitio existentes con medidas comunes", () => {
    const r = FieldProjectSchema.safeParse({
      ...valid(),
      org: { mode: "existing", id: ORG },
      site: { mode: "existing", id: SITE },
      specs: { manufacturer: "Vestas", blade_length_m: 62 },
    });
    expect(r.success).toBe(true);
  });
  test("organización nueva con sitio existente es incoherente", () => {
    const r = FieldProjectSchema.safeParse({ ...valid(), site: { mode: "existing", id: SITE } });
    expect(r.success).toBe(false);
  });
  test.each([
    ["correo inválido", { technician: { email: "no-es-correo" } }],
    ["sin turbinas", { turbines: [] }],
    ["más de 300 turbinas", { turbines: Array.from({ length: 301 }, (_, i) => ({ name: `T${i}` })) }],
    ["nombre de turbina largo", { turbines: [{ name: "x".repeat(61) }] }],
    ["lat fuera de rango", { turbines: [{ name: "A", lat: 91, lon: 0 }] }],
    ["slug inválido", { org: { mode: "new", name: "Cliente Z", slug: "Cliente Z" } }],
    ["proyecto sin nombre", { project: { name: "", status: "in_field" } }],
    ["fecha final anterior", { project: { name: "Campaña", status: "in_field", start_date: "2026-05-02", end_date: "2026-05-01" } }],
    ["pala fuera de rango", { specs: { blade_length_m: 500 } }],
    ["sitio de otro tipo", { site: { mode: "new", name: "Planta", kind: "solar_plant" } }],
  ])("rechaza %s", (_n, patch) => {
    expect(FieldProjectSchema.safeParse({ ...valid(), ...patch }).success).toBe(false);
  });
});
