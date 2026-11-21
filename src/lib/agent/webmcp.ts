/**
 * Herramientas WebMCP (navigator.modelContext) de la página: solo lectura y navegación.
 * Lógica pura: las acciones sobre el DOM llegan inyectadas (`WebMcpEnv`), así se prueba sin navegador.
 * Nunca rellena ni envía el formulario de evaluación: solo lleva al usuario hasta él.
 */
import type { Dictionary } from "@/i18n/types";
import type { Locale } from "@/i18n/config";
import { runPublicTool, TOOL_INPUT_SCHEMAS, type PublicToolName, type ToolContext } from "./tools";

/** Anclas reales de la página de inicio. */
export const HOME_SECTIONS = ["inicio", "servicios", "por-que-inspeccionar", "apps", "portal", "nosotros", "proceso", "evaluacion"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export interface WebMcpEnv {
  /** Desplaza a la sección si existe en la página actual; false si no está. */
  scrollToSection(id: string): boolean;
  /** Desplaza al formulario y enfoca su primer campo (sin escribir nada); false si no está. */
  focusAssessmentForm(): boolean;
  /** Navega a otra URL (cuando la sección está en otra página). */
  navigate(url: string): void;
}

export interface WebMcpToolResult {
  content: { type: "text"; text: string }[];
}

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: true };
  execute(input: Record<string, unknown>): Promise<WebMcpToolResult>;
}

const text = (t: string): WebMcpToolResult => ({ content: [{ type: "text", text: t }] });

const COPY = {
  es: {
    company: "Información general de NEXUS: qué hace, misión y visión. Solo lectura.",
    services: "Lista los servicios de NEXUS con su resumen y enlace. Solo lectura.",
    contact: "Correo y formulario de contacto de NEXUS. Solo lectura.",
    goTo: "Desplaza la página hasta una sección del sitio (navegación, no modifica datos).",
    sectionArg: "Sección de destino",
    openForm:
      "Lleva al usuario al formulario de evaluación sin costo y enfoca su primer campo. No rellena ni envía el formulario: lo completa la persona.",
    scrolled: "Se desplazó la página a la sección",
    navigating: "Se abre la página en la sección",
    unknownSection: "Sección desconocida. Opciones",
    formFocused: "Formulario de evaluación a la vista. La persona debe completarlo y enviarlo; el agente no lo envía.",
    formNavigating: "Se abre la página con el formulario de evaluación. La persona debe completarlo y enviarlo.",
  },
  en: {
    company: "General information about NEXUS: what it does, mission and vision. Read-only.",
    services: "Lists NEXUS services with summary and link. Read-only.",
    contact: "NEXUS contact email and form. Read-only.",
    goTo: "Scrolls the page to a section of the site (navigation only, changes no data).",
    sectionArg: "Target section",
    openForm:
      "Takes the user to the free assessment form and focuses its first field. It does not fill in or submit the form: the person does.",
    scrolled: "Scrolled the page to the section",
    navigating: "Opening the page at the section",
    unknownSection: "Unknown section. Options",
    formFocused: "Assessment form is in view. The person must complete and submit it; the agent does not submit it.",
    formNavigating: "Opening the page with the assessment form. The person must complete and submit it.",
  },
} as const;

/** Etiquetas de las secciones a partir de la navegación del diccionario. */
function sectionLabels(t: Dictionary): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const item of t.nav.items) {
    const id = item.href.split("#")[1];
    if (id) labels[id] = item.label;
  }
  return labels;
}

export function buildWebMcpTools(t: Dictionary, locale: Locale, env: WebMcpEnv): WebMcpTool[] {
  const c = COPY[locale];
  const ctx: ToolContext = { defaultLocale: locale, getDictionary: () => t };
  const readOnly = { readOnlyHint: true } as const;
  const noArgs = { type: "object", properties: {}, additionalProperties: false };
  const home = t.meta.homePath;
  const labels = sectionLabels(t);

  const read = (name: PublicToolName, description: string): WebMcpTool => ({
    name,
    description,
    inputSchema: noArgs,
    annotations: readOnly,
    async execute() {
      const parsed = TOOL_INPUT_SCHEMAS[name].safeParse({});
      if (!parsed.success) return text("Invalid input");
      return text(runPublicTool(name, {}, ctx).content[0]?.text ?? "");
    },
  });

  return [
    read("get_company_info", c.company),
    read("list_services", c.services),
    read("get_contact_info", c.contact),
    {
      name: "go_to_section",
      description: `${c.goTo} ${HOME_SECTIONS.map((s) => (labels[s] ? `${s} (${labels[s]})` : s)).join(", ")}.`,
      inputSchema: {
        type: "object",
        properties: { section: { type: "string", enum: [...HOME_SECTIONS], description: c.sectionArg } },
        required: ["section"],
        additionalProperties: false,
      },
      annotations: readOnly,
      async execute(input) {
        const section = input?.section;
        if (typeof section !== "string" || !(HOME_SECTIONS as readonly string[]).includes(section)) {
          return text(`${c.unknownSection}: ${HOME_SECTIONS.join(", ")}.`);
        }
        if (env.scrollToSection(section)) return text(`${c.scrolled}: ${section}.`);
        env.navigate(`${home}#${section}`);
        return text(`${c.navigating}: ${section}.`);
      },
    },
    {
      name: "open_assessment_form",
      description: c.openForm,
      inputSchema: noArgs,
      annotations: readOnly,
      async execute() {
        if (env.focusAssessmentForm()) return text(c.formFocused);
        env.navigate(`${home}#evaluacion`);
        return text(c.formNavigating);
      },
    },
  ];
}
