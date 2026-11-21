/**
 * Herramientas públicas de solo lectura que NEXUS ofrece a agentes de IA.
 * Una sola definición alimenta: el servidor MCP (/api/mcp), la tarjeta
 * /.well-known/mcp/server-card.json y las herramientas WebMCP del navegador.
 *
 * Módulo puro y sin acceso a datos de usuarios: todo sale de los diccionarios
 * y de seo.ts. No importa "@/i18n" (que arrastra los dos diccionarios completos)
 * para poder usarse también en el cliente: el diccionario llega por contexto.
 */
import { z } from "zod";
import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";
import { companyPath, SERVICE_SLUGS, servicePath } from "@/i18n/routes";
import { absoluteUrl, SITE } from "@/lib/seo";

export const AGENT_SERVER = {
  name: "nexus-site",
  title: "NEXUS",
  version: "1.0.0",
  description:
    "Información pública de NEXUS (apps para drones DJI, plataformas de inspección y desarrollo web, México): empresa, servicios y contacto. Solo lectura, sin autenticación.",
} as const;

export const CONTENT_POLICY = "search=yes, ai-input=yes, ai-train=no";

const langField = z.enum(["es", "en"]).optional().describe("Idioma de la respuesta: es (por defecto) o en.");

export const TOOL_INPUT_SCHEMAS = {
  get_company_info: z.strictObject({ lang: langField }),
  list_services: z.strictObject({ lang: langField }),
  get_service: z.strictObject({
    slug: z
      .string()
      .min(1)
      .max(100)
      .describe("Identificador del servicio: dji_apps, platforms o web; o el slug de su página (en español o inglés)."),
    lang: langField,
  }),
  get_contact_info: z.strictObject({ lang: langField }),
} as const;

export type PublicToolName = keyof typeof TOOL_INPUT_SCHEMAS;
export const PUBLIC_TOOL_NAMES = Object.keys(TOOL_INPUT_SCHEMAS) as PublicToolName[];

export interface ToolDefinition {
  readonly name: PublicToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: { readonly readOnlyHint: true; readonly idempotentHint: true; readonly openWorldHint: false };
}

const META: Record<PublicToolName, { title: string; description: string }> = {
  get_company_info: {
    title: "Información de la empresa",
    description: "Resumen de NEXUS: qué hace, misión, visión, idiomas y a qué se dedica. Solo lectura.",
  },
  list_services: {
    title: "Lista de servicios",
    description: "Lista los servicios de NEXUS (apps para controles DJI, plataformas de inspección, desarrollo web) con su resumen y enlace.",
  },
  get_service: {
    title: "Detalle de un servicio",
    description: "Detalle de un servicio de NEXUS por su identificador o slug: introducción, secciones, casos de uso y preguntas frecuentes.",
  },
  get_contact_info: {
    title: "Información de contacto",
    description: "Cómo contactar a NEXUS: correo electrónico y enlace al formulario de evaluación sin costo.",
  },
};

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _omit, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _omit;
  return rest;
}

export const PUBLIC_TOOLS: readonly ToolDefinition[] = PUBLIC_TOOL_NAMES.map((name) => ({
  name,
  ...META[name],
  inputSchema: jsonSchemaOf(TOOL_INPUT_SCHEMAS[name]),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
}));

export interface ToolContext {
  /** Idioma por defecto cuando la herramienta no recibe `lang`. */
  readonly defaultLocale: Locale;
  readonly getDictionary: (locale: Locale) => Dictionary;
}

export interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

function ok(data: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function serviceUrl(locale: Locale, id: string): string | null {
  const pair = SERVICE_SLUGS.find((s) => s.id === id);
  return pair ? absoluteUrl(servicePath(locale, pair[locale])) : null;
}

function companyInfo(t: Dictionary, locale: Locale) {
  const pillar = (id: string) => t.about.pillars.find((p) => p.id === id)?.body ?? "";
  return {
    name: SITE.name,
    url: absoluteUrl(t.meta.homePath),
    language: t.meta.htmlLang,
    description: t.meta.description,
    tagline: t.footer.tagline,
    about: [...t.about.origin],
    goal: pillar("objetivo"),
    mission: pillar("mision"),
    vision: pillar("vision"),
    services: t.services.items.map((s) => s.title),
    availableLanguages: ["es", "en"],
    notice: t.footer.noticeBody,
    aboutPage: absoluteUrl(companyPath(locale, "about")),
    contactPage: absoluteUrl(companyPath(locale, "contact")),
  };
}

function servicesList(t: Dictionary, locale: Locale) {
  return t.services.items.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    points: [...s.points],
    url: serviceUrl(locale, s.id),
  }));
}

function resolveService(slug: string, lang: Locale | undefined, fallback: Locale) {
  const needle = slug.trim().toLowerCase();
  const pair = SERVICE_SLUGS.find((s) => s.id === needle || s.es === needle || s.en === needle);
  if (!pair) return null;
  const locale: Locale = lang ?? (pair.en === needle ? "en" : pair.es === needle ? "es" : fallback);
  return { pair, locale };
}

function contactInfo(t: Dictionary, locale: Locale) {
  return {
    email: SITE.email,
    assessmentForm: absoluteUrl(`${t.meta.homePath}#evaluacion`),
    contactPage: absoluteUrl(companyPath(locale, "contact")),
    language: t.meta.htmlLang,
    nextSteps: t.assessment.nextSteps.map((n) => n.v),
    privacy: t.assessment.privacyNote,
  };
}

/** Ejecuta una herramienta ya validada. */
export function runPublicTool(name: PublicToolName, args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const lang = (args.lang as Locale | undefined) ?? undefined;
  const locale = lang ?? ctx.defaultLocale;
  const t = ctx.getDictionary(locale);
  switch (name) {
    case "get_company_info":
      return ok(companyInfo(t, locale));
    case "list_services":
      return ok({ services: servicesList(t, locale) });
    case "get_contact_info":
      return ok(contactInfo(t, locale));
    case "get_service": {
      const found = resolveService(String(args.slug ?? ""), lang, ctx.defaultLocale);
      if (!found) {
        const valid = SERVICE_SLUGS.map((s) => s.id).join(", ");
        return fail(`Servicio no encontrado. Identificadores válidos: ${valid}.`);
      }
      const dict = ctx.getDictionary(found.locale);
      const page = dict.servicePages.find((p) => p.slug === found.pair[found.locale]);
      if (!page) return fail("Servicio no disponible en este idioma.");
      return ok({
        id: found.pair.id,
        language: dict.meta.htmlLang,
        url: absoluteUrl(servicePath(found.locale, page.slug)),
        title: page.h1,
        keyword: page.keyword,
        summary: page.metaDescription,
        intro: page.intro,
        sections: page.sections.map((s) => ({ title: s.h2, body: s.body ?? null, bullets: [...(s.bullets ?? [])] })),
        useCases: page.useCases.items.map((u) => ({ title: u.title, body: u.body })),
        faq: page.faq.map((f) => ({ question: f.q, answer: f.a })),
        assessmentForm: absoluteUrl(`${dict.meta.homePath}#evaluacion`),
      });
    }
  }
}

export function isPublicToolName(name: unknown): name is PublicToolName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(TOOL_INPUT_SCHEMAS, name);
}
