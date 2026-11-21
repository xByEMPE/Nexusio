import { describe, expect, it, vi } from "vitest";
import { getDictionary } from "@/i18n";
import { COMPANY_PATHS, SERVICE_SLUGS, alternatePath, servicePath } from "@/i18n/routes";
import { handleRpc } from "./jsonrpc";
import { buildLlmsTxt } from "./llms";
import { markdownForPath } from "./markdown";
import { ACCEPT_MARKDOWN_PATTERN, MARKDOWN_SOURCES } from "./md-routes";
import { buildRobotsTxt } from "./robots";
import { buildServerCard } from "./server-card";
import { PUBLIC_TOOLS, runPublicTool } from "./tools";
import { buildWebMcpTools, HOME_SECTIONS, type WebMcpEnv } from "./webmcp";

const ctx = { defaultLocale: "es" as const, getDictionary };
const rpc = (method: string, params?: unknown, id: unknown = 1) => handleRpc({ jsonrpc: "2.0", id, method, params }, ctx);

describe("robots.txt", () => {
  const txt = buildRobotsTxt();
  it("incluye Content-Signal bajo User-agent: *", () => {
    const lines = txt.split("\n");
    expect(lines[0]).toBe("User-agent: *");
    expect(lines).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
  });
  it("mantiene reglas y sitemap", () => {
    for (const l of ["Disallow: /admin", "Disallow: /portal", "Disallow: /auth", "Disallow: /api/", "Allow: /api/mcp"]) {
      expect(txt).toContain(l);
    }
    expect(txt).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });
});

describe("llms.txt", () => {
  const txt = buildLlmsTxt(getDictionary);
  it("sigue llmstxt.org", () => {
    expect(txt.startsWith("# NEXUS\n\n> ")).toBe(true);
    expect(txt).toContain("## Español");
    expect(txt).toContain("## English");
  });
  it("enlaza páginas clave, correo y política", () => {
    for (const s of SERVICE_SLUGS) {
      expect(txt).toContain(servicePath("es", s.es));
      expect(txt).toContain(servicePath("en", s.en));
    }
    for (const p of Object.values(COMPANY_PATHS)) {
      expect(txt).toContain(p.es);
      expect(txt).toContain(p.en);
    }
    expect(txt).toContain("contacto@nexusio.com.mx");
    expect(txt).toContain("ai-train=no");
  });
});

describe("markdown", () => {
  it("renderiza home ES y EN con enlaces absolutos y correo", () => {
    const es = markdownForPath("/", getDictionary)!;
    const en = markdownForPath("/en", getDictionary)!;
    expect(es.startsWith("# NEXUS")).toBe(true);
    expect(en).toContain("Assessment form");
    expect(es).toMatch(/\]\(https?:\/\//);
    expect(es).toContain("mailto:contacto@nexusio.com.mx");
    expect(es).not.toContain("<div");
  });
  it("cubre servicios, acerca y contacto en ambos idiomas; ignora el resto", () => {
    for (const s of SERVICE_SLUGS) {
      expect(markdownForPath(servicePath("es", s.es), getDictionary)).toContain("##");
      expect(markdownForPath(servicePath("en", s.en) + "/", getDictionary)).toContain("##");
    }
    for (const p of Object.values(COMPANY_PATHS)) {
      expect(markdownForPath(p.es, getDictionary)).toBeTruthy();
      expect(markdownForPath(p.en, getDictionary)).toBeTruthy();
    }
    expect(markdownForPath("/admin", getDictionary)).toBeNull();
    expect(markdownForPath("/servicios/inexistente", getDictionary)).toBeNull();
  });
});

describe("regla Accept", () => {
  const re = new RegExp(ACCEPT_MARKDOWN_PATTERN);
  it("markdown sí; navegadores no", () => {
    expect(re.test("text/markdown")).toBe(true);
    expect(re.test("text/markdown, text/html;q=0.5")).toBe(true);
    expect(re.test("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(re.test("text/html, text/markdown")).toBe(false);
  });
  it("no incluye rutas privadas", () => {
    expect(MARKDOWN_SOURCES.some((s) => /admin|portal|api|_next|auth/.test(s))).toBe(false);
  });
});

describe("rutas", () => {
  it("alternatePath cubre Acerca y Contacto", () => {
    expect(alternatePath("/acerca", "en")).toBe("/en/about");
    expect(alternatePath("/en/contact", "es")).toBe("/contacto");
  });
});

describe("herramientas públicas", () => {
  it("tienen definición con esquema objeto y solo lectura", () => {
    expect(PUBLIC_TOOLS.map((t) => t.name)).toEqual(["get_company_info", "list_services", "get_service", "get_contact_info"]);
    for (const t of PUBLIC_TOOLS) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations.readOnlyHint).toBe(true);
    }
  });
  it("devuelven texto y datos en el idioma pedido", () => {
    const es = runPublicTool("list_services", {}, ctx);
    const en = runPublicTool("list_services", { lang: "en" }, ctx);
    expect(es.content[0]!.text).toContain("/servicios/");
    expect(en.content[0]!.text).toContain("/en/services/");
    expect(runPublicTool("get_contact_info", {}, ctx).content[0]!.text).toContain("contacto@nexusio.com.mx");
  });
  it("get_service acepta id y slug de cualquier idioma, y rechaza desconocidos", () => {
    expect(runPublicTool("get_service", { slug: "dji_apps" }, ctx).isError).toBeUndefined();
    const en = runPublicTool("get_service", { slug: "web-development" }, ctx);
    expect(en.structuredContent?.language).toBe("en");
    expect(runPublicTool("get_service", { slug: "nada" }, ctx).isError).toBe(true);
  });
});

describe("JSON-RPC", () => {
  it("initialize negocia versión y capacidades", () => {
    const out = rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t" } });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } } });
    const old = rpc("initialize", { protocolVersion: "1999-01-01" });
    expect((old.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe("2025-11-25");
  });
  it("notificaciones -> 202 sin cuerpo; ping; tools/list", () => {
    expect(handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toEqual({ status: 202, body: null });
    expect(rpc("ping").body).toMatchObject({ result: {} });
    const list = rpc("tools/list").body as { result: { tools: unknown[] } };
    expect(list.result.tools).toHaveLength(4);
  });
  it("tools/call válido e inválido", () => {
    const good = rpc("tools/call", { name: "get_service", arguments: { slug: "web", lang: "en" } }).body as {
      result: { content: unknown[] };
    };
    expect(good.result.content).toHaveLength(1);
    expect(rpc("tools/call", { name: "get_service", arguments: { slug: "" } }).body).toMatchObject({ error: { code: -32602 } });
    expect(rpc("tools/call", { name: "get_service", arguments: { slug: "web", extra: 1 } }).body).toMatchObject({
      error: { code: -32602 },
    });
    expect(rpc("tools/call", { name: "nope" }).body).toMatchObject({ error: { code: -32602 } });
    expect(rpc("tools/call", {}).body).toMatchObject({ error: { code: -32602 } });
  });
  it("método desconocido, petición mal formada y lotes", () => {
    expect(rpc("foo").body).toMatchObject({ error: { code: -32601 } });
    const invalid = handleRpc({ jsonrpc: "1.0", id: 3, method: "ping" }, ctx);
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ id: 3, error: { code: -32600 } });
    expect(handleRpc("x", ctx).status).toBe(400);
    const batch = handleRpc([{ jsonrpc: "2.0", id: 1, method: "ping" }], ctx);
    expect(batch.status).toBe(400);
    expect(batch.body).toMatchObject({ id: null, error: { code: -32600 } });
  });
});

describe("server card", () => {
  it("apunta al endpoint real y expone las mismas herramientas", () => {
    const c = buildServerCard();
    expect(c.endpoint).toMatch(/^https?:\/\/.+\/api\/mcp$/);
    expect(c.transport.type).toBe("streamable-http");
    expect(c.authentication.required).toBe(false);
    expect(c.tools.map((t) => t.name)).toEqual(PUBLIC_TOOLS.map((t) => t.name));
  });
});

describe("WebMCP", () => {
  const mk = (over: Partial<WebMcpEnv> = {}) => {
    const env: WebMcpEnv = {
      scrollToSection: vi.fn(() => true),
      focusAssessmentForm: vi.fn(() => true),
      navigate: vi.fn(),
      ...over,
    };
    return { env, tools: buildWebMcpTools(getDictionary("en"), "en", env) };
  };
  const by = (tools: ReturnType<typeof mk>["tools"], n: string) => tools.find((t) => t.name === n)!;

  it("expone las 5 herramientas de solo lectura con esquema", () => {
    const { tools } = mk();
    expect(tools.map((t) => t.name)).toEqual([
      "get_company_info",
      "list_services",
      "get_contact_info",
      "go_to_section",
      "open_assessment_form",
    ]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations.readOnlyHint).toBe(true);
    }
    const props = by(tools, "go_to_section").inputSchema.properties as { section: { enum: string[] } };
    expect(props.section.enum).toEqual([...HOME_SECTIONS]);
  });
  it("las de lectura responden en el idioma de la página", async () => {
    const { tools } = mk();
    expect((await by(tools, "list_services").execute({})).content[0]!.text).toContain("/en/services/");
  });
  it("go_to_section desplaza, navega si no está y valida", async () => {
    const a = mk();
    await by(a.tools, "go_to_section").execute({ section: "apps" });
    expect(a.env.scrollToSection).toHaveBeenCalledWith("apps");
    const b = mk({ scrollToSection: vi.fn(() => false) });
    await by(b.tools, "go_to_section").execute({ section: "portal" });
    expect(b.env.navigate).toHaveBeenCalledWith("/en#portal");
    const c = mk();
    const r = await by(c.tools, "go_to_section").execute({ section: "../admin" });
    expect(r.content[0]!.text).toContain("Unknown section");
    expect(c.env.scrollToSection).not.toHaveBeenCalled();
  });
  it("open_assessment_form solo enfoca: no envía nada", async () => {
    const a = mk();
    const r = await by(a.tools, "open_assessment_form").execute({});
    expect(a.env.focusAssessmentForm).toHaveBeenCalled();
    expect(r.content[0]!.text).toContain("does not submit");
    const b = mk({ focusAssessmentForm: vi.fn(() => false) });
    await by(b.tools, "open_assessment_form").execute({});
    expect(b.env.navigate).toHaveBeenCalledWith("/en#evaluacion");
  });
});
