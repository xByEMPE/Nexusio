import { describe, expect, test } from "vitest";
import { formatContacts, optNum, optStr, parseContacts, parseTurbineList, readFieldProjectForm } from "./form";

describe("form helpers", () => {
  test("optStr / optNum", () => {
    const fd = new FormData();
    fd.set("a", "  hola ");
    fd.set("b", " ");
    fd.set("n", "52,5");
    fd.set("x", "abc");
    expect(optStr(fd, "a")).toBe("hola");
    expect(optStr(fd, "b")).toBeUndefined();
    expect(optStr(fd, "z")).toBeUndefined();
    expect(optNum(fd, "n")).toBe(52.5);
    expect(optNum(fd, "b")).toBeUndefined();
    expect(optNum(fd, "x")).toBeNaN();
  });
  test("contactos ida y vuelta", () => {
    const parsed = parseContacts("Cliente | Ana Pérez | ana@x.co\n\nPiloto | Luis");
    expect(parsed).toEqual([
      { role: "Cliente", name: "Ana Pérez", email: "ana@x.co" },
      { role: "Piloto", name: "Luis" },
    ]);
    expect(parseContacts(formatContacts(parsed))).toEqual(parsed);
    expect(formatContacts(null)).toBe("");
  });
});

describe("parseTurbineList", () => {
  test("lee nombre | código | lat | lon, con campos opcionales", () => {
    const r = parseTurbineList("WTG-01 | A1 | 52,5 | 13.4\nWTG-02\nWTG-03 | C3");
    expect(r.errors).toEqual([]);
    expect(r.turbines).toEqual([
      { name: "WTG-01", code: "A1", lat: 52.5, lon: 13.4 },
      { name: "WTG-02" },
      { name: "WTG-03", code: "C3" },
    ]);
  });
  test("ignora líneas vacías y comentarios, y conserva el número de línea original", () => {
    const r = parseTurbineList("# lista\n\nWTG-01\n   \n# otra\nWTG-01");
    expect(r.turbines).toEqual([{ name: "WTG-01" }]);
    expect(r.errors).toEqual([{ line: 6, message: expect.stringContaining("línea 3") }]);
  });
  test("duplicado dentro de la lista: error con el número de línea", () => {
    const r = parseTurbineList("A\nB\nA");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ line: 3 });
    expect(r.errors[0]!.message).toContain("repetida");
  });
  test("nombre demasiado largo", () => {
    const r = parseTurbineList(`${"x".repeat(61)}`);
    expect(r.errors).toEqual([{ line: 1, message: expect.stringContaining("60") }]);
  });
  test("nombre vacío con otras columnas", () => {
    const r = parseTurbineList(" | A1");
    expect(r.errors[0]).toMatchObject({ line: 1 });
  });
  test.each([
    ["lat fuera de rango", "A | | 91 | 10"],
    ["lon fuera de rango", "A | | 10 | 181"],
    ["lat sin lon", "A | | 10"],
    ["lat no numérica", "A | | abc | 10"],
    ["demasiadas columnas", "A | B | 1 | 2 | 3"],
  ])("rechaza %s", (_n, raw) => {
    const r = parseTurbineList(raw);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.line).toBe(1);
  });
  test("más de 300 turbinas", () => {
    const raw = Array.from({ length: 301 }, (_, i) => `T${i}`).join("\n");
    const r = parseTurbineList(raw);
    expect(r.errors.some((e) => e.message.includes("300"))).toBe(true);
  });
});

describe("readFieldProjectForm", () => {
  const base = () => {
    const fd = new FormData();
    fd.set("org_mode", "new");
    fd.set("org_name", "Cliente Z");
    fd.set("org_slug", "cliente-z");
    fd.set("site_mode", "new");
    fd.set("site_name", "Parque Z");
    fd.set("turbines", "WTG-01\nWTG-02");
    fd.set("project_name", "Campaña 2026");
    fd.set("technician_email", "Tec@Ejemplo.com");
    return fd;
  };
  test("arma la entrada con organización y sitio nuevos, estado por defecto y correo en minúsculas", () => {
    const { input, lineErrors } = readFieldProjectForm(base());
    expect(lineErrors).toEqual([]);
    expect(input).toMatchObject({
      org: { mode: "new", name: "Cliente Z", slug: "cliente-z" },
      site: { mode: "new", name: "Parque Z", kind: "wind_farm" },
      turbines: [{ name: "WTG-01" }, { name: "WTG-02" }],
      project: { name: "Campaña 2026", status: "in_field" },
      technician: { email: "tec@ejemplo.com" },
    });
  });
  test("organización y sitio existentes; medidas comunes", () => {
    const fd = base();
    fd.set("org_mode", "existing");
    fd.set("organization_id", "6f1c0c2e-3b0e-4c8e-9f0a-2d3a4b5c6d7e");
    fd.set("site_mode", "existing");
    fd.set("site_id", "7f1c0c2e-3b0e-4c8e-9f0a-2d3a4b5c6d7e");
    fd.set("blade_length_m", "62,5");
    fd.set("manufacturer", "Vestas");
    const { input } = readFieldProjectForm(fd);
    expect(input).toMatchObject({
      org: { mode: "existing", id: "6f1c0c2e-3b0e-4c8e-9f0a-2d3a4b5c6d7e" },
      site: { mode: "existing", id: "7f1c0c2e-3b0e-4c8e-9f0a-2d3a4b5c6d7e" },
      specs: { manufacturer: "Vestas", blade_length_m: 62.5 },
    });
  });
  test("devuelve los errores de línea de las turbinas", () => {
    const fd = base();
    fd.set("turbines", "A\nA");
    expect(readFieldProjectForm(fd).lineErrors).toHaveLength(1);
  });
});
