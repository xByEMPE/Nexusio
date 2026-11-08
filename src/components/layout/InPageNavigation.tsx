"use client";

import { useEffect } from "react";
import { scrollToSection } from "@/lib/scroll-to-section";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("ui.navigation");

/**
 * Intercepta los clics en enlaces internos (`href="#seccion"`) de toda la
 * página y los resuelve con `scrollToSection`. Se registra en fase de captura
 * y marca el evento como `defaultPrevented`, de modo que ni el salto nativo
 * ni el enrutador de Next.js compiten con el desplazamiento. Los manejadores
 * `onClick` propios de cada enlace (p. ej. cerrar el menú móvil) siguen
 * ejecutándose. No renderiza nada.
 */
export function InPageNavigation() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;

      const url = new URL(anchor.href, window.location.href);
      const samePage = url.origin === window.location.origin && url.pathname === window.location.pathname;
      const id = decodeURIComponent(url.hash.slice(1));
      if (!samePage || !id) return;

      if (!scrollToSection(id, { smooth: !reduced.matches })) return;
      e.preventDefault();
      if (window.location.hash !== url.hash) window.history.pushState(null, "", url.hash);
      log.info("nav.section", { id });
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
