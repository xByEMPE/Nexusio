"use client";

import { usePathname } from "next/navigation";
import { useDict, useLocale } from "@/i18n/LocaleProvider";
import { alternatePath } from "@/i18n/routes";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("ui.navigation");

/**
 * Cambia entre español e inglés manteniendo la página equivalente.
 * Es un enlace normal (recarga completa): cada idioma tiene su propio
 * diseño raíz con su `lang`.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useDict().nav;
  const pathname = usePathname() ?? "/";
  const target = locale === "es" ? "en" : "es";
  const href = alternatePath(pathname, target);

  return (
    <a
      href={href}
      hrefLang={target === "en" ? "en" : "es-MX"}
      lang={target === "en" ? "en" : "es"}
      aria-label={t.switchLanguageAria}
      onClick={() => log.info("nav.language", { to: target })}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-[2px] border border-border-subtle px-2 font-mono text-2xs uppercase tracking-label text-foreground-muted transition-colors duration-spring-actuator ease-spring-actuator hover:border-foreground/40 hover:text-foreground"
    >
      {target === "en" ? "EN" : "ES"}
    </a>
  );
}
