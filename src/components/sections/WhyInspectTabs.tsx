"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

type Locale = "es" | "en";
type FigureProps = { locale: Locale };

/**
 * Altura reservada por figura (móvil / tablet / escritorio), medida con las
 * figuras ya montadas: el esqueleto ocupa lo mismo y no hay salto al cargar.
 */
const FIGURE_BOX = [
  "min-h-[800px] md:min-h-[890px] lg:min-h-[1030px]",
  "min-h-[800px] md:min-h-[920px] lg:min-h-[1060px]",
  "min-h-[800px] md:min-h-[920px] lg:min-h-[1090px]",
] as const;

function Skeleton({ label, box }: { label: string; box: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("panel grid place-items-center", box)}>
      <span className="label-caps animate-pulse motion-reduce:animate-none">{label}</span>
    </div>
  );
}

// Carga perezosa: cada figura es su propio chunk y solo se pide al montarla.
// Sin SSR: se montan únicamente cuando la sección ya está cerca del viewport.
const SKELETON_LABEL = { current: "" };
const BOX = { current: FIGURE_BOX[0] as string };
const loading = () => <Skeleton label={SKELETON_LABEL.current} box={BOX.current} />;
const PalaFigure = dynamic<FigureProps>(() => import("@/components/anatomia/pala/PalaFigure").then((m) => m.PalaFigure), { ssr: false, loading });
const PanelFigure = dynamic<FigureProps>(() => import("@/components/anatomia/paneles/PanelFigure").then((m) => m.PanelFigure), { ssr: false, loading });
const LineFigure = dynamic<FigureProps>(() => import("@/components/anatomia/lineas/LineFigure").then((m) => m.LineFigure), { ssr: false, loading });

const FIGURES = [PalaFigure, PanelFigure, LineFigure] as const;
const IDS = ["pala", "panel", "linea"] as const;

interface Tab {
  readonly label: string;
  readonly title: string;
  readonly body: string;
}

interface Props {
  readonly locale: Locale;
  readonly tablistAria: string;
  readonly loading: string;
  readonly tabs: readonly Tab[];
}

export function WhyInspectTabs({ locale, tablistAria, loading: loadingLabel, tabs }: Props) {
  SKELETON_LABEL.current = loadingLabel;
  const uid = useId();
  const [active, setActive] = useState(0);
  const [near, setNear] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Solo se monta una figura cuando la sección está por entrar al viewport.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = tabs.length - 1;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const Figure = FIGURES[active] ?? PalaFigure;
  const box = FIGURE_BOX[active] ?? FIGURE_BOX[0];
  BOX.current = box;
  const tab = tabs[active];

  return (
    <div ref={rootRef} className="mt-14">
      <div role="tablist" aria-label={tablistAria} className="grid gap-1 rounded-[2px] border border-border-subtle bg-surface-layer p-1 sm:grid-cols-3">
        {tabs.map((tb, i) => {
          const selected = i === active;
          return (
            <button
              key={IDS[i]}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${uid}-tab-${IDS[i]}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${IDS[i]}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "flex items-center gap-3 rounded-[1px] border px-4 py-3 text-left font-mono text-xs uppercase tracking-label transition-colors duration-spring-actuator ease-spring-actuator",
                selected
                  ? "border-accent-primary/60 bg-accent-deep text-foreground"
                  : "border-transparent text-foreground-subtle hover:text-foreground-muted",
              )}
            >
              <span className="tabular text-2xs text-accent-primary">{String(i + 1).padStart(2, "0")}</span>
              {tb.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${uid}-panel-${IDS[active]}`}
        aria-labelledby={`${uid}-tab-${IDS[active]}`}
        tabIndex={-1}
        className="mt-8"
      >
        {tab && (
          <div className="mb-8 max-w-3xl">
            <h3 className="text-xl font-medium md:text-2xl">{tab.title}</h3>
            <p className="mt-3 leading-relaxed text-foreground-muted">{tab.body}</p>
          </div>
        )}
        <div className={cn("mx-auto min-w-0 max-w-[1080px]", box)}>
          {near ? <Figure key={IDS[active]} locale={locale} /> : <Skeleton label={loadingLabel} box={box} />}
        </div>
      </div>
    </div>
  );
}
