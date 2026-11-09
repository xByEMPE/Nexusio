"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { readTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { createLogger } from "@/lib/observability/logger";
import { useOptionalDict } from "@/i18n/LocaleProvider";

const log = createLogger("ui.interaction");

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "dark");
}

function Sun() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <circle cx={10} cy={10} r={3.6} fill="none" stroke="currentColor" strokeWidth={1.4} />
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1={10}
          y1={2}
          x2={10}
          y2={4}
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          transform={`rotate(${i * 45} 10 10)`}
        />
      ))}
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <path
        d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Botón de cambio de tema. Muestra el icono del tema al que se cambiará. */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const tt = useOptionalDict()?.theme ?? { toLight: "Cambiar a tema claro", toDark: "Cambiar a tema oscuro", light: "Tema claro", dark: "Tema oscuro" };
  const label = next === "light" ? tt.toLight : tt.toDark;

  const toggle = () => {
    setTheme(next);
    log.info("theme.change", { theme: next });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[2px] border border-border-subtle text-foreground-muted",
        "transition-colors duration-spring-actuator ease-spring-actuator hover:border-foreground/40 hover:text-foreground",
        withLabel ? "w-full px-3 text-sm" : "w-9",
        className,
      )}
    >
      <span className="relative grid h-4 w-4 place-items-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={next}
            className="absolute inset-0 grid place-items-center"
            initial={{ y: 14, rotate: -60, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: -14, rotate: 60, opacity: 0 }}
            transition={spring("actuator")}
          >
            {next === "light" ? <Sun /> : <Moon />}
          </motion.span>
        </AnimatePresence>
      </span>
      {withLabel && <span suppressHydrationWarning>{next === "light" ? tt.light : tt.dark}</span>}
    </button>
  );
}
