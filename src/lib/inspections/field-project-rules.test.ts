import { describe, expect, test } from "vitest";
import {
  crewDefaults,
  decideOrganization,
  decideProjectDefaults,
  decideProject,
  isUniqueViolation,
  normalizeName,
  planTechnician,
  existingAccountNote,
  reusedTurbinesWarning,
} from "./field-project-rules";

describe("normalizeName", () => {
  test("ignora mayúsculas, acentos y espacios repetidos", () => {
    expect(normalizeName("  Parque  EÓLICO Ñandú ")).toBe("parque eolico nandu");
  });
});

describe("decideOrganization", () => {
  test("mismo nombre (sin distinguir acentos ni mayúsculas): reutiliza", () => {
    expect(decideOrganization("Energía Norte", "energia  norte")).toEqual({ action: "continue" });
  });
  test("otro nombre: se detiene y nombra a la dueña del identificador", () => {
    const d = decideOrganization("Cliente A", "Cliente Z");
    expect(d.action).toBe("stop");
    expect(d.action === "stop" && d.message).toContain("“Cliente A”");
  });
});

describe("decideProject", () => {
  test.each(["delivered", "archived"])("estado %s: se detiene antes de ligar y asignar", (status) => {
    const d = decideProject({ name: "Campaña", status }, "in_field");
    expect(d.action).toBe("stop");
    expect(d.action === "stop" && d.message).toMatch(/Campaña.*estado.*reábrelo o usa otro código/);
  });
  test("estado distinto del pedido: continúa con advertencia", () => {
    const d = decideProject({ name: "Campaña", status: "planned" }, "in_field");
    expect(d.action).toBe("continue");
    expect(d.action === "continue" && d.warning).toContain("Planeado");
  });
  test("mismo estado: continúa sin advertencia", () => {
    expect(decideProject({ name: "Campaña", status: "in_field" }, "in_field")).toEqual({ action: "continue" });
  });
});

describe("planTechnician", () => {
  const tech = { platform_role: "technician", is_active: true };
  test("sin cuenta: invita", () => expect(planTechnician(null, false, null)).toEqual({ kind: "invite" }));
  test("administrador: se detiene", () => {
    expect(planTechnician({ platform_role: "admin", is_active: true }, false, true).kind).toBe("stop");
  });
  test("sin rol y miembro de cliente: se detiene; sin membresía: promueve", () => {
    expect(planTechnician({ platform_role: null, is_active: true }, true, null).kind).toBe("stop");
    expect(planTechnician({ platform_role: null, is_active: true }, false, null)).toEqual({ kind: "promote" });
  });
  test("técnico inactivo: activa", () => {
    expect(planTechnician({ ...tech, is_active: false }, false, true)).toEqual({ kind: "activate" });
  });
  test("invitación sin aceptar: reenvía; aceptada o desconocida: reutiliza", () => {
    expect(planTechnician(tech, false, false)).toEqual({ kind: "resend" });
    expect(planTechnician(tech, false, true)).toEqual({ kind: "reuse" });
    expect(planTechnician(tech, false, null)).toEqual({ kind: "reuse" });
  });
  test("servicio activo y aceptado: reutiliza", () => {
    expect(planTechnician({ platform_role: "service", is_active: true }, false, true)).toEqual({ kind: "reuse" });
  });
});

describe("reusedTurbinesWarning", () => {
  const existing = new Map([["A", { code: "X1", lat: 1, lon: 2 }]]);
  test("sin reutilizadas: sin aviso", () => {
    expect(reusedTurbinesWarning([{ name: "B" }], existing)).toBeUndefined();
  });
  test("reutilizada idéntica: aviso simple", () => {
    const w = reusedTurbinesWarning([{ name: "A", code: "X1" }], existing);
    expect(w).toContain("no se modificaron sus datos");
    expect(w).not.toContain("distintos");
  });
  test("reutilizada con código o coordenadas distintos: lo menciona", () => {
    const w = reusedTurbinesWarning([{ name: "A", code: "Z9" }], existing);
    expect(w).toContain("distintos (A)");
  });
});

test("isUniqueViolation", () => {
  expect(isUniqueViolation({ code: "23505" })).toBe(true);
  expect(isUniqueViolation({ code: "42501" })).toBe(false);
  expect(isUniqueViolation(null)).toBe(false);
});

describe("existingAccountNote", () => {
  const note = "La cuenta ya existía: si necesita crear o recuperar su contraseña, usa «Reenviar acceso» en Usuarios o en el proyecto.";
  test.each(["reuse", "activate", "promote"] as const)("cuenta existente (%s): avisa de «Reenviar acceso»", (k) => {
    expect(existingAccountNote(k)).toBe(note);
  });
  test.each(["invite", "resend", "stop"] as const)("%s: sin nota (ya se envió invitación o no aplica)", (k) => {
    expect(existingAccountNote(k)).toBeNull();
  });
});

describe("crewDefaults", () => {
  test("el técnico principal cuenta como piloto; el resto se une con «, » por función y en orden", () => {
    expect(
      crewDefaults({ name: "Ana Pérez", role: "pilot" }, [
        { full_name: "Luis Gómez", role: "pilot" },
        { full_name: "Marta Ruiz", role: "assistant" },
        { full_name: "Iván Soto", role: "assistant" },
      ]),
    ).toEqual({ pilot: "Ana Pérez, Luis Gómez", assistant: "Marta Ruiz, Iván Soto" });
  });
  test("sin asistentes: solo piloto", () => {
    expect(crewDefaults({ name: "Ana", role: "pilot" }, [])).toEqual({ pilot: "Ana" });
  });
  test("el técnico principal puede ser asistente", () => {
    expect(crewDefaults({ name: "Ana", role: "assistant" }, [{ full_name: "Luis", role: "pilot" }])).toEqual({ pilot: "Luis", assistant: "Ana" });
  });
  test("no repite un nombre (sin distinguir acentos ni mayúsculas)", () => {
    expect(crewDefaults({ name: "Ana Pérez", role: "pilot" }, [{ full_name: "ana  perez", role: "pilot" }])).toEqual({ pilot: "Ana Pérez" });
  });
});

describe("decideProjectDefaults", () => {
  const ex = (p: string | null, a: string | null, d: string | null) => ({ default_pilot_name: p, default_assistant_name: a, default_drone_model: d });
  test("sin datos pedidos: sin aviso", () => {
    expect(decideProjectDefaults("P", ex("X", null, null), {})).toBeUndefined();
  });
  test("iguales (reintento del mismo formulario): sin aviso", () => {
    expect(decideProjectDefaults("P", ex("Ana", "Luis", "M300"), { pilot: "ana", assistant: "Luis", drone: "M300" })).toBeUndefined();
  });
  test("distintos: avisa qué campos y que no se modificaron", () => {
    const w = decideProjectDefaults("Campaña", ex("Otro", null, "M300"), { pilot: "Ana", assistant: "Luis", drone: "M300" });
    expect(w).toContain("«Campaña»");
    expect(w).toContain("piloto");
    expect(w).toContain("asistente");
    expect(w).not.toContain("dron");
    expect(w).toContain("No se modificaron");
  });
});
