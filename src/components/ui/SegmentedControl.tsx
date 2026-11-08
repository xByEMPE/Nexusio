"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

interface Props<T extends string> {
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
  readonly className?: string;
  readonly size?: "sm" | "md";
  /** Ids de los paneles controlados, para enlazar `aria-controls`. */
  readonly panelIdFor?: (value: T) => string;
}

/**
 * Selector tipo tablist con indicador que se desplaza por resorte.
 * Navegación por teclado: flechas, Home y End (patrón WAI-ARIA Tabs).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
  panelIdFor,
}: Props<T>) {
  const groupId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const last = options.length - 1;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = idx === last ? 0 : idx + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = idx === 0 ? last : idx - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("relative inline-flex rounded-[2px] border border-border-subtle bg-surface-layer p-1", className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${groupId}-${opt.value}`}
            aria-selected={selected}
            aria-controls={panelIdFor?.(opt.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative z-10 whitespace-nowrap rounded-[1px] font-mono uppercase tracking-label transition-colors duration-spring-actuator ease-spring-actuator",
              size === "sm" ? "px-2.5 py-1.5 text-2xs" : "px-4 py-2 text-xs",
              selected ? "text-foreground" : "text-foreground-subtle hover:text-foreground-muted",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${groupId}-indicator`}
                className="absolute inset-0 -z-10 rounded-[1px] border border-accent-primary/60 bg-accent-deep"
                transition={spring("actuator")}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
