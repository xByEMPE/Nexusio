import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATALOG_ORG_SLUG,
  catalogOrgSlug,
  describeSpecs,
  decideSiteSelection,
  filterSites,
  mergeMachineLines,
  searchSites,
  hubHeights,
  siteLabel,
  summarizeModels,
  turbineListText,
} from "./catalog";
import { parseTurbineList, readFieldProjectForm } from "./form";
import { FieldProjectSchema } from "@/contracts/inspections-admin";

const sites = [
  { id: "1", name: "Vicente Guerrero", state: "Puebla", city: "Tepeaca" },
  { id: "2", name: "La Ventosa", state: "Oaxaca", city: "Juchitán de Zaragoza" },
  { id: "3", name: "Guerrero Negro", state: "Baja California Sur", city: "Mulegé" },
  { id: "4", name: "Sin ubicación", state: null, city: null },
];

describe("catalogOrgSlug", () => {
  it("usa nexus-01 por defecto y acepta CATALOG_ORG_SLUG", () => {
    expect(DEFAULT_CATALOG_ORG_SLUG).toBe("nexus-01");
    expect(catalogOrgSlug({})).toBe("nexus-01");
    expect(catalogOrgSlug({ CATALOG_ORG_SLUG: "  " })).toBe("nexus-01");
    expect(catalogOrgSlug({ CATALOG_ORG_SLUG: " otro-catalogo " })).toBe("otro-catalogo");
  });
});

describe("siteLabel", () => {
  it("«Nombre · Estado · Municipio» omitiendo lo que falta", () => {
    expect(siteLabel(sites[0]!)).toBe("Vicente Guerrero · Puebla · Tepeaca");
    expect(siteLabel(sites[3]!)).toBe("Sin ubicación");
  });
});

describe("filterSites", () => {
  it("sin búsqueda: orden alfabético, con límite", () => {
    expect(filterSites(sites, "").map((s) => s.id)).toEqual(["3", "2", "4", "1"]);
    expect(filterSites(sites, "  ", 2)).toHaveLength(2);
  });
  it("busca por nombre, estado o municipio sin importar mayúsculas ni acentos", () => {
    expect(filterSites(sites, "OAXACA").map((s) => s.id)).toEqual(["2"]);
    expect(filterSites(sites, "juchitan").map((s) => s.id)).toEqual(["2"]);
    expect(filterSites(sites, "tepeaca").map((s) => s.id)).toEqual(["1"]);
    expect(filterSites(sites, "zzz")).toEqual([]);
  });
  it("todas las palabras deben aparecer y el nombre que empieza igual va primero", () => {
    expect(filterSites(sites, "guerrero puebla").map((s) => s.id)).toEqual(["1"]);
    expect(filterSites(sites, "guerrero").map((s) => s.id)).toEqual(["3", "1"]);
    expect(filterSites(sites, "vicente guerrero").map((s) => s.id)).toEqual(["1"]);
  });
});

describe("lista de turbinas precargada", () => {
  const machines = [
    { name: "WTG 10", code: "WTG10" },
    { name: "WTG 2", code: "WTG2" },
    { name: "WTG 01", code: null },
  ];
  it("genera líneas «nombre | código» en orden natural", () => {
    expect(turbineListText(machines)).toBe("WTG 01\nWTG 2 | WTG2\nWTG 10 | WTG10");
  });
  it("el texto se interpreta de vuelta con el parser actual", () => {
    const { turbines, errors } = parseTurbineList(turbineListText([{ name: "WTG 01", code: "WTG01" }, { name: "WTG 02", code: "WTG02" }]));
    expect(errors).toEqual([]);
    expect(turbines).toEqual([
      { name: "WTG 01", code: "WTG01" },
      { name: "WTG 02", code: "WTG02" },
    ]);
  });
});

describe("especificaciones del parque", () => {
  const v136 = { manufacturer: "Vestas", model: "V136", hub_height_m: 82 };
  const gw = { manufacturer: "Goldwind", model: "GW87", hub_height_m: 85 };
  it("un modelo", () => {
    expect(summarizeModels([v136, v136])).toEqual([{ label: "Vestas V136", count: 2 }]);
    expect(describeSpecs([v136, v136])).toBe("Vestas V136 (2) · buje 82 m");
  });
  it("varios modelos, de más a menos máquinas, y alturas de buje distintas", () => {
    const list = [gw, v136, v136, { manufacturer: null, model: null, hub_height_m: null }];
    expect(summarizeModels(list).map((m) => m.label)).toEqual(["Vestas V136", "Goldwind GW87"]);
    expect(hubHeights(list)).toEqual([82, 85]);
    expect(describeSpecs(list)).toBe("2 modelos: Vestas V136 (2), Goldwind GW87 (1) · buje 82 / 85 m");
  });
  it("sin datos", () => {
    expect(describeSpecs([{ manufacturer: null, model: null, hub_height_m: null }])).toBe("");
  });
});

describe("modo catálogo del formulario", () => {
  const ID = "00000000-0000-4000-8000-000000000010";
  const fd = (extra: Record<string, string>) => {
    const f = new FormData();
    const base = { org_mode: "existing", organization_id: ID, turbines: "WTG 01", project_name: "Proyecto", technician_email: "t@example.com", ...extra };
    for (const [k, v] of Object.entries(base)) f.set(k, v);
    return f;
  };
  it("lee site_mode=catalog y valida el uuid", () => {
    const ok = readFieldProjectForm(fd({ site_mode: "catalog", catalog_site_id: ID }));
    expect(ok.input).toMatchObject({ site: { mode: "catalog", catalog_site_id: ID } });
    expect(FieldProjectSchema.safeParse(ok.input).success).toBe(true);
    const bad = readFieldProjectForm(fd({ site_mode: "catalog", catalog_site_id: "xyz" }));
    expect(FieldProjectSchema.safeParse(bad.input).success).toBe(false);
    const missing = readFieldProjectForm(fd({ site_mode: "catalog" }));
    expect(FieldProjectSchema.safeParse(missing.input).success).toBe(false);
  });
  it("no rompe los modos existentes", () => {
    expect(readFieldProjectForm(fd({ site_mode: "existing", site_id: ID })).input).toMatchObject({ site: { mode: "existing", id: ID } });
    expect(readFieldProjectForm(fd({ site_mode: "new", site_name: "Parque" })).input).toMatchObject({ site: { mode: "new", name: "Parque" } });
  });
});

describe("decideSiteSelection (organización nueva + catálogo)", () => {
  const CAT = "cat-org";
  const all = [
    { id: "own", organization_id: "client" },
    { id: "cat", organization_id: CAT },
    { id: "other", organization_id: "x" },
  ];
  const decide = (o: Partial<Parameters<typeof decideSiteSelection>[0]>) =>
    decideSiteSelection({ orgChoice: "client", orgIsNew: false, siteChoice: "cat", sites: all, catalogOrgId: CAT, ...o });
  it("parque del catálogo con organización existente distinta: catalog", () => {
    expect(decide({})).toBe("catalog");
  });
  it("parque del catálogo con organización nueva: catalog (no vuelve a «nuevo»)", () => {
    expect(decide({ orgChoice: "__new__", orgIsNew: true })).toBe("catalog");
  });
  it("parque propio solo con organización existente", () => {
    expect(decide({ siteChoice: "own" })).toBe("existing");
    expect(decide({ siteChoice: "own", orgChoice: "__new__", orgIsNew: true })).toBe("new");
  });
  it("desde la organización del catálogo es «existing»; nuevo, ajeno o desconocido: new", () => {
    expect(decide({ orgChoice: CAT })).toBe("existing");
    expect(decide({ siteChoice: "__new__" })).toBe("new");
    expect(decide({ siteChoice: "other" })).toBe("new");
    expect(decide({ siteChoice: "zzz" })).toBe("new");
    expect(decide({ catalogOrgId: null })).toBe("new");
  });
});

describe("mergeMachineLines", () => {
  const machines = [
    { name: "WTG 01", code: "WTG01" },
    { name: "WTG 02", code: "WTG02" },
  ];
  it("texto vacío o precarga previa: reemplaza", () => {
    expect(mergeMachineLines("", machines, false)).toBe("WTG 01 | WTG01\nWTG 02 | WTG02");
    expect(mergeMachineLines("  \n", machines, false)).toBe("WTG 01 | WTG01\nWTG 02 | WTG02");
    expect(mergeMachineLines("WTG 99", machines, true)).toBe("WTG 01 | WTG01\nWTG 02 | WTG02");
  });
  it("líneas manuales: se conservan y se agregan las del parque sin duplicar nombres", () => {
    expect(mergeMachineLines("WTG 02 | MIO\nEXTRA-1\n", machines, false)).toBe("WTG 02 | MIO\nEXTRA-1\nWTG 01 | WTG01");
    expect(mergeMachineLines("WTG 01\nWTG 02", machines, false)).toBe("WTG 01\nWTG 02");
  });
});

describe("searchSites total", () => {
  it("informa cuántas coincidencias hubo antes de recortar", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ name: `Parque ${i}`, state: "X", city: null }));
    const r = searchSites(many, "", 50);
    expect(r.items).toHaveLength(50);
    expect(r.total).toBe(60);
    expect(searchSites(many, "parque 5", 50).total).toBe(15);
  });
});
