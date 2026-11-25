import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  createSessionClient: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  inviteWithAccess: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/inspections/admin-action", () => ({ requireAdminAction: m.requireAdminAction }));
vi.mock("@/lib/inspections/invite", () => ({ inviteWithAccess: m.inviteWithAccess }));
vi.mock("@/services/supabase/server", () => ({ createSessionClient: m.createSessionClient, createServiceClient: m.createServiceClient }));

import { createFieldProject, listSiteMachines } from "./field-projects";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CAT_ORG = u(1);
const CLIENT = u(2);
const OTHER = u(3);
const VG = u(10); // «Vicente Guerrero» del catálogo (2 modelos)
const CAT_B = u(11);
const FOREIGN_SITE = u(12); // parque de otra organización (no es del catálogo)
const CLIENT_SITE = u(13); // parque propio del cliente con el mismo nombre que uno del catálogo

type Row = Record<string, unknown>;

/** Doble en memoria del cliente de Supabase: filtros eq/in, límites, únicos de sitios/activos/especificaciones y embebido de specs. */
function makeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    organizations: [
      { id: CAT_ORG, name: "NEXUS", slug: "nexus-01" },
      { id: CLIENT, name: "Cliente Norte", slug: "cliente-norte" },
      { id: OTHER, name: "Otra", slug: "otra" },
    ],
    sites: [
      { id: VG, organization_id: CAT_ORG, kind: "wind_farm", name: "Vicente Guerrero", state: "Puebla", city: "Tepeaca", lat: 18.5, lon: -97.9 },
      { id: CAT_B, organization_id: CAT_ORG, kind: "wind_farm", name: "Parque B", state: "Oaxaca", city: "Juchitán", lat: null, lon: null },
      { id: FOREIGN_SITE, organization_id: OTHER, kind: "wind_farm", name: "Ajeno", state: null, city: null, lat: null, lon: null },
    ],
    assets: [
      ...[1, 2, 3].map((n) => ({ id: u(100 + n), organization_id: CAT_ORG, site_id: VG, kind: "wind_turbine", name: `WTG 0${n}`, code: `WTG0${n}`, lat: null, lon: null })),
      { id: u(104), organization_id: CAT_ORG, site_id: VG, kind: "wind_turbine", name: "WTG 04", code: "WTG04", lat: null, lon: null },
      { id: u(105), organization_id: CAT_ORG, site_id: VG, kind: "wind_turbine", name: "WTG 05", code: "WTG05", lat: null, lon: null }, // sin specs
    ],
    wind_turbine_specs: [
      ...[101, 102, 103].map((id) => ({ asset_id: u(id), manufacturer: "Vestas", model: "V136", hub_height_m: 82, blade_length_m: null, rotor_diameter_m: null })),
      { asset_id: u(104), manufacturer: "Goldwind", model: "GW87", hub_height_m: 85, blade_length_m: 42.5, rotor_diameter_m: 87, wtgm: { rev: 1 } },
    ],
    projects: [],
    project_sites: [],
    project_assignments: [],
    profiles: [],
    organization_members: [],
    ...seed,
  };
  let n = 1000;
  const log: { table: string; op: string; rows: Row[] }[] = [];
  const limits: number[] = [];

  const unique: Record<string, string[][]> = {
    sites: [["organization_id", "name"]],
    assets: [["site_id", "name"]],
    wind_turbine_specs: [["asset_id"]],
    organizations: [["slug"]],
  };

  function builder(table: string) {
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | Row[] = [];
    let cols = "*";
    let wantRows = false;
    let single: "maybe" | "one" | undefined;
    let lim: number | undefined;
    const filters: ((r: Row) => boolean)[] = [];

    const exec = () => {
      const rows = tables[table] ?? [];
      if (op === "insert") {
        const incoming = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...r }));
        for (const r of incoming) {
          for (const cols2 of unique[table] ?? []) {
            if ([...rows, ...incoming.filter((x) => x !== r)].some((x) => x !== r && cols2.every((c) => x[c] === r[c]))) {
              return { data: null, error: { code: "23505" } };
            }
          }
        }
        const added = incoming.map((r) => ({ id: u(n++), ...r }));
        rows.push(...added);
        log.push({ table, op, rows: added });
        const data = wantRows ? added : null;
        return { data: single && data ? data[0] : data, error: null };
      }
      let found = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        found.forEach((r) => Object.assign(r, payload));
        log.push({ table, op, rows: found });
        return { data: wantRows ? found : null, error: null };
      }
      if (lim !== undefined) {
        limits.push(lim);
        found = found.slice(0, lim);
      }
      if (table === "assets" && cols.includes("wind_turbine_specs(")) {
        found = found.map((r) => ({ ...r, wind_turbine_specs: tables.wind_turbine_specs!.find((s) => s.asset_id === r.id) ?? null }));
      }
      if (single) return { data: found[0] ?? null, error: null };
      return { data: found, error: null };
    };

    const b = {
      select(c: string) {
        cols = c;
        if (op !== "select") wantRows = true;
        return b;
      },
      insert(p: Row | Row[]) {
        op = "insert";
        payload = p;
        return b;
      },
      update(p: Row) {
        op = "update";
        payload = p;
        return b;
      },
      eq(k: string, v: unknown) {
        filters.push((r) => r[k] === v);
        return b;
      },
      in(k: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[k]));
        return b;
      },
      order: () => b,
      limit(x: number) {
        lim = x;
        return b;
      },
      maybeSingle() {
        single = "maybe";
        return Promise.resolve(exec());
      },
      single() {
        single = "one";
        return Promise.resolve(exec());
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(exec()).then(res, rej);
      },
    };
    return b;
  }

  return { tables, log, limits, from: (t: string) => builder(t), inserted: (t: string) => log.filter((l) => l.table === t && l.op === "insert").flatMap((l) => l.rows) };
}

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    org_mode: "existing",
    organization_id: CLIENT,
    site_mode: "catalog",
    catalog_site_id: VG,
    turbines: "WTG 01 | WTG01\nWTG 02 | WTG02\nWTG 04 | WTG04",
    project_name: "Inspección Vicente Guerrero",
    technician_email: "tecnico@example.com",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) if (v !== "") fd.set(k, v);
  return fd;
}

let db: ReturnType<typeof makeDb>;
const use = (d: ReturnType<typeof makeDb>) => {
  db = d;
  m.createSessionClient.mockResolvedValue(d);
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CATALOG_ORG_SLUG;
  m.requireAdminAction.mockResolvedValue({ viewer: {} });
  m.createServiceClient.mockReturnValue({ auth: { admin: { inviteUserByEmail: vi.fn(), getUserById: vi.fn() } } });
  m.inviteWithAccess.mockResolvedValue({ ok: true, userId: u(900) });
  use(makeDb());
});

const specsOf = (assetId: unknown) => db.tables.wind_turbine_specs!.find((s) => s.asset_id === assetId);
const clientAssets = () => db.tables.assets!.filter((a) => a.organization_id === CLIENT);

describe("createFieldProject con parque del catálogo", () => {
  it("a otra organización: copia el parque (estado, municipio, coordenadas), las máquinas y sus especificaciones", async () => {
    const r = await createFieldProject(form());
    expect(r.ok).toBe(true);
    const site = db.tables.sites!.find((s) => s.organization_id === CLIENT)!;
    expect(site).toMatchObject({ name: "Vicente Guerrero", kind: "wind_farm", state: "Puebla", city: "Tepeaca", lat: 18.5, lon: -97.9 });
    expect(site.id).not.toBe(VG);
    const assets = clientAssets();
    expect(assets.map((a) => a.name).sort()).toEqual(["WTG 01", "WTG 02", "WTG 04"]);
    expect(assets.every((a) => a.site_id === site.id && a.organization_id === CLIENT)).toBe(true);
    // Varios modelos en el mismo parque: cada máquina copia los datos de su homónima
    const byName = (name: string) => specsOf(assets.find((a) => a.name === name)!.id);
    expect(byName("WTG 01")).toMatchObject({ manufacturer: "Vestas", model: "V136", hub_height_m: 82 });
    expect(byName("WTG 04")).toMatchObject({ manufacturer: "Goldwind", model: "GW87", hub_height_m: 85, blade_length_m: 42.5, rotor_diameter_m: 87, wtgm: { rev: 1 } });
    expect(byName("WTG 01")!.wtgm).toBeNull();
    // El parque del catálogo no se toca
    expect(db.tables.assets!.filter((a) => a.site_id === VG)).toHaveLength(5);
    const step = r.steps.find((s) => s.key === "catalog")!;
    expect(step).toMatchObject({ status: "created" });
    expect(step.detail).toContain("«Vicente Guerrero» copiado a la organización «Cliente Norte», 3 máquinas");
    expect(r.steps.find((s) => s.key === "site")).toMatchObject({ status: "created" });
  });

  it("reenviar el formulario no duplica nada (parque y máquinas reutilizados, especificaciones intactas)", async () => {
    await createFieldProject(form());
    const sitesBefore = db.tables.sites!.length;
    const assetsBefore = db.tables.assets!.length;
    const specsBefore = db.tables.wind_turbine_specs!.length;
    const r = await createFieldProject(form());
    expect(r.ok).toBe(true);
    expect(db.tables.sites).toHaveLength(sitesBefore);
    expect(db.tables.assets).toHaveLength(assetsBefore);
    expect(db.tables.wind_turbine_specs).toHaveLength(specsBefore);
    expect(r.steps.find((s) => s.key === "site")).toMatchObject({ status: "reused" });
    expect(r.steps.find((s) => s.key === "catalog")).toMatchObject({ status: "reused" });
  });

  it("si el cliente ya tiene un parque con ese nombre lo reutiliza sin modificarlo", async () => {
    use(
      makeDb({
        sites: [
          { id: VG, organization_id: CAT_ORG, kind: "wind_farm", name: "Vicente Guerrero", state: "Puebla", city: "Tepeaca", lat: 18.5, lon: -97.9 },
          { id: CLIENT_SITE, organization_id: CLIENT, kind: "wind_farm", name: "Vicente Guerrero", state: null, city: null, lat: null, lon: null },
        ],
      }),
    );
    const r = await createFieldProject(form());
    expect(r.ok).toBe(true);
    expect(db.inserted("sites")).toHaveLength(0);
    expect(db.tables.sites!.find((s) => s.id === CLIENT_SITE)).toMatchObject({ state: null, city: null });
    expect(clientAssets().every((a) => a.site_id === CLIENT_SITE)).toBe(true);
    expect(clientAssets()).toHaveLength(3);
    expect(r.steps.find((s) => s.key === "site")).toMatchObject({ status: "reused" });
    expect(r.steps.find((s) => s.key === "catalog")!.detail).toContain("ya estaba en la organización");
  });

  it("máquinas ya existentes: conservan sus especificaciones; las que no tenían reciben las del catálogo", async () => {
    use(
      makeDb({
        sites: [
          { id: VG, organization_id: CAT_ORG, kind: "wind_farm", name: "Vicente Guerrero", state: "Puebla", city: "Tepeaca", lat: null, lon: null },
          { id: CLIENT_SITE, organization_id: CLIENT, kind: "wind_farm", name: "Vicente Guerrero", state: null, city: null, lat: null, lon: null },
        ],
        assets: [
          { id: u(101), organization_id: CAT_ORG, site_id: VG, kind: "wind_turbine", name: "WTG 01", code: "WTG01" },
          { id: u(104), organization_id: CAT_ORG, site_id: VG, kind: "wind_turbine", name: "WTG 04", code: "WTG04" },
          { id: u(201), organization_id: CLIENT, site_id: CLIENT_SITE, kind: "wind_turbine", name: "WTG 01", code: "PROPIO" },
          { id: u(202), organization_id: CLIENT, site_id: CLIENT_SITE, kind: "wind_turbine", name: "WTG 04", code: "WTG04" },
        ],
        wind_turbine_specs: [
          { asset_id: u(101), manufacturer: "Vestas", model: "V136", hub_height_m: 82, blade_length_m: null, rotor_diameter_m: null },
          { asset_id: u(104), manufacturer: "Goldwind", model: "GW87", hub_height_m: 85, blade_length_m: 42.5, rotor_diameter_m: 87 },
          { asset_id: u(201), manufacturer: "Propio", model: "P1", hub_height_m: 70, blade_length_m: null, rotor_diameter_m: null },
        ],
      }),
    );
    const r = await createFieldProject(form({ turbines: "WTG 01\nWTG 04" }));
    expect(r.ok).toBe(true);
    expect(specsOf(u(201))).toMatchObject({ manufacturer: "Propio", model: "P1", hub_height_m: 70 }); // no se pisa
    expect(specsOf(u(202))).toMatchObject({ manufacturer: "Goldwind", model: "GW87", hub_height_m: 85 });
    expect(clientAssets()).toHaveLength(2); // nada duplicado
    expect(db.tables.assets!.find((a) => a.id === u(201))!.code).toBe("PROPIO");
  });

  it("las medidas comunes completan lo que el catálogo no trae y las máquinas fuera del catálogo se crean con aviso", async () => {
    const r = await createFieldProject(form({ turbines: "WTG 01\nWTG 05\nWTG 99", blade_length_m: "50", manufacturer: "Genérico" }));
    expect(r.ok).toBe(true);
    const find = (name: string) => clientAssets().find((a) => a.name === name)!;
    // WTG 01: catálogo manda en fabricante/modelo/buje; la pala común completa el hueco
    expect(specsOf(find("WTG 01").id)).toMatchObject({ manufacturer: "Vestas", model: "V136", hub_height_m: 82, blade_length_m: 50 });
    // WTG 05 existe en el catálogo sin especificaciones: solo las comunes
    expect(specsOf(find("WTG 05").id)).toMatchObject({ manufacturer: "Genérico", model: null, hub_height_m: null, blade_length_m: 50 });
    // WTG 99 no existe en el catálogo: turbina nueva con las comunes, y se avisa
    expect(specsOf(find("WTG 99").id)).toMatchObject({ manufacturer: "Genérico", blade_length_m: 50 });
    expect(r.ok && r.warnings.some((w) => w.includes("WTG 99") && w.includes("no existe en el catálogo"))).toBe(true);
    expect(r.ok && r.warnings.some((w) => w.includes("WTG 05"))).toBe(false);
  });

  it("máquina nueva fuera del catálogo y sin medidas comunes: se crea sin especificaciones", async () => {
    const r = await createFieldProject(form({ turbines: "WTG 99" }));
    expect(r.ok).toBe(true);
    expect(specsOf(clientAssets()[0]!.id)).toBeUndefined();
  });

  it("organización nueva: crea la organización y copia el parque dentro", async () => {
    const r = await createFieldProject(form({ org_mode: "new", organization_id: "", org_name: "Cliente Sur", org_slug: "cliente-sur" }));
    expect(r.ok).toBe(true);
    const org = db.tables.organizations!.find((o) => o.slug === "cliente-sur")!;
    expect(db.tables.sites!.find((s) => s.organization_id === org.id)).toMatchObject({ name: "Vicente Guerrero", state: "Puebla" });
  });

  it("misma organización del catálogo: reutiliza el parque y sus máquinas sin clonar", async () => {
    const r = await createFieldProject(form({ organization_id: CAT_ORG, turbines: "WTG 01\nWTG 02" }));
    expect(r.ok).toBe(true);
    expect(db.inserted("sites")).toHaveLength(0);
    expect(db.inserted("assets")).toHaveLength(0);
    expect(db.inserted("wind_turbine_specs")).toHaveLength(0);
    const link = db.tables.project_sites!;
    expect(link).toHaveLength(1);
    expect(link[0]!.site_id).toBe(VG);
    expect(r.steps.find((s) => s.key === "site")!.detail).toContain("catálogo, misma organización");
    expect(r.steps.find((s) => s.key === "catalog")).toMatchObject({ status: "reused" });
  });

  it("rechaza un catalog_site_id que no es un uuid, sin tocar la base", async () => {
    const r = await createFieldProject(form({ catalog_site_id: "no-es-uuid" }));
    expect(r.ok).toBe(false);
    expect(db.log).toHaveLength(0);
  });

  it("rechaza un parque de otra organización (no del catálogo) y uno inexistente", async () => {
    for (const id of [FOREIGN_SITE, u(77), CLIENT_SITE]) {
      const r = await createFieldProject(form({ catalog_site_id: id }));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.message).toContain("no pertenece al catálogo");
    }
    expect(db.inserted("sites")).toHaveLength(0);
    expect(db.inserted("assets")).toHaveLength(0);
    expect(db.inserted("projects")).toHaveLength(0);
  });

  it("el slug del catálogo es configurable con CATALOG_ORG_SLUG", async () => {
    process.env.CATALOG_ORG_SLUG = "otra";
    // «Vicente Guerrero» ya no es del catálogo; sí lo es el parque de la organización «otra»
    expect((await createFieldProject(form())).ok).toBe(false);
    const r = await createFieldProject(form({ catalog_site_id: FOREIGN_SITE, turbines: "WTG-X" }));
    expect(r.ok).toBe(true);
    expect(db.tables.sites!.find((s) => s.organization_id === CLIENT)).toMatchObject({ name: "Ajeno" });
  });

  it("sin organización de catálogo: lo informa", async () => {
    process.env.CATALOG_ORG_SLUG = "no-existe";
    const r = await createFieldProject(form());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("catálogo de parques no está disponible");
  });

  it("no admin: rechaza sin abrir cliente", async () => {
    m.requireAdminAction.mockResolvedValue({ error: { ok: false, message: "x" } });
    expect(await createFieldProject(form())).toMatchObject({ ok: false });
    expect(m.createSessionClient).not.toHaveBeenCalled();
  });
});

describe("listSiteMachines", () => {
  it("no admin: no abre cliente", async () => {
    m.requireAdminAction.mockResolvedValue({ error: { ok: false, message: "x" } });
    expect(await listSiteMachines(VG)).toMatchObject({ ok: false });
    expect(m.createSessionClient).not.toHaveBeenCalled();
  });

  it("id no válido: rechaza sin abrir cliente", async () => {
    expect(await listSiteMachines("abc")).toMatchObject({ ok: false });
    expect(m.createSessionClient).not.toHaveBeenCalled();
  });

  it("devuelve las máquinas con su fabricante, modelo y buje", async () => {
    const r = await listSiteMachines(VG);
    expect(r.ok && r.truncated).toBe(false);
    expect(r.ok && r.machines.map((x) => x.name)).toEqual(["WTG 01", "WTG 02", "WTG 03", "WTG 04", "WTG 05"]);
    expect(r.ok && r.machines[3]).toEqual({ name: "WTG 04", code: "WTG04", manufacturer: "Goldwind", model: "GW87", hub_height_m: 85 });
    expect(r.ok && r.machines[4]).toMatchObject({ manufacturer: null, model: null, hub_height_m: null });
  });

  it("limita el tamaño: pide 301 y devuelve 300 con el aviso de que hubo más", async () => {
    const many = Array.from({ length: 305 }, (_, i) => ({ id: u(5000 + i), organization_id: CAT_ORG, site_id: CAT_B, kind: "wind_turbine", name: `WTG ${i + 1}`, code: null }));
    use(makeDb({ assets: many }));
    const r = await listSiteMachines(CAT_B);
    expect(db.limits).toEqual([301]);
    expect(r.ok && r.machines).toHaveLength(300);
    expect(r.ok && r.truncated).toBe(true);
    // Orden natural: «WTG 2» antes que «WTG 10»
    expect(r.ok && r.machines.slice(0, 3).map((x) => x.name)).toEqual(["WTG 1", "WTG 2", "WTG 3"]);
  });
});
