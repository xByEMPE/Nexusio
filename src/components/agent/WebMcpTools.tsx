"use client";

import { useEffect } from "react";
import { useDict, useLocale } from "@/i18n/LocaleProvider";
import { buildWebMcpTools, type WebMcpEnv, type WebMcpTool } from "@/lib/agent/webmcp";
import { scrollToSection } from "@/lib/scroll-to-section";

/** Tipos mínimos de la API WebMCP (aún en borrador): no se declara nada global. */
interface ModelContextLike {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): unknown;
  unregisterTool?(name: string): void;
}

const FIELD = 'input:not([type="hidden"]):not([tabindex="-1"]), select, textarea';

let focusTimer: number | undefined;

const env: WebMcpEnv = {
  scrollToSection: (id) => scrollToSection(id),
  focusAssessmentForm() {
    const section = document.getElementById("evaluacion");
    if (!section) return false;
    scrollToSection("evaluacion");
    const field = section.querySelector<HTMLElement>(`form ${FIELD}`);
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => field?.focus({ preventScroll: true }), 400);
    return true;
  },
  navigate: (url) => window.location.assign(url),
};

/**
 * Registra herramientas WebMCP de solo lectura/navegación cuando el navegador
 * expone `navigator.modelContext`. Sin la API no hace nada. No renderiza nada.
 */
export function WebMcpTools() {
  const t = useDict();
  const locale = useLocale();

  useEffect(() => {
    const mc = (navigator as Navigator & { modelContext?: ModelContextLike }).modelContext;
    if (!mc || typeof mc.registerTool !== "function") return;

    const controller = new AbortController();
    const registered: string[] = [];
    for (const tool of buildWebMcpTools(t, locale, env)) {
      try {
        mc.registerTool(tool, { signal: controller.signal });
        registered.push(tool.name);
      } catch {
        /* nombre duplicado u otra incompatibilidad: se ignora */
      }
    }

    return () => {
      window.clearTimeout(focusTimer);
      controller.abort();
      for (const name of registered) {
        try {
          mc.unregisterTool?.(name);
        } catch {
          /* ya retirada por la señal */
        }
      }
    };
  }, [t, locale]);

  return null;
}
