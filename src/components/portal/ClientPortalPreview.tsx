"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { NexusMark } from "@/components/brand/NexusMark";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { createLogger } from "@/lib/observability/logger";
import { PortalOverview } from "./PortalOverview";
import { PortalReports } from "./PortalReports";

const log = createLogger("ui.navigation");

function Loading() {
  return <div className="grid h-full min-h-[420px] place-items-center text-xs text-foreground-subtle">Cargando…</div>;
}

const AnomalyInspector = dynamic(
  () => import("@/components/modules/AnomalyInspector").then((m) => m.AnomalyInspector),
  { ssr: false, loading: Loading },
);
const PointCloudViewer = dynamic(
  () => import("@/components/modules/PointCloudViewer").then((m) => m.PointCloudViewer),
  { ssr: false, loading: Loading },
);

const VIEWS = [
  { id: "overview", label: "Resumen", path: "resumen", icon: "M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" },
  { id: "findings", label: "Hallazgos", path: "hallazgos/torre-t-0412", icon: "M8 2l6 11H2zM8 6v3M8 11v.5" },
  { id: "model", label: "Modelo 3D", path: "modelos/acopios-rajo-norte", icon: "M8 2l6 3v6l-6 3-6-3V5zM2 5l6 3 6-3M8 8v6" },
  { id: "reports", label: "Reportes", path: "reportes", icon: "M4 2h6l3 3v9H4zM10 2v3h3M6 8h5M6 11h5" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const TITLES: Record<ViewId, { title: string; subtitle: string }> = {
  overview: { title: "Resumen", subtitle: "Estado de todos sus proyectos" },
  findings: { title: "Hallazgos", subtitle: "Revise cada detección y confírmela o descártela" },
  model: { title: "Modelo 3D", subtitle: "Acopios Rajo Norte · volumen calculado automáticamente" },
  reports: { title: "Reportes", subtitle: "Descargue los reportes aprobados" },
};

/** Maqueta navegable del portal de clientes dentro de un marco de navegador. */
export function ClientPortalPreview() {
  const [view, setView] = useState<ViewId>("overview");
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];

  const go = (id: ViewId) => {
    setView(id);
    log.info("portal.view", { view: id });
  };

  return (
    <div className="panel reticle overflow-hidden shadow-[0_40px_120px_-40px_hsl(var(--accent-primary)/0.35)]">
      {/* Barra del navegador */}
      <div className="flex items-center gap-3 border-b border-border-subtle bg-surface-raised px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded-[2px] bg-background-base px-3 py-1 font-mono text-2xs text-foreground-subtle">
          portal.suempresa.cl/<span className="text-foreground-muted">{current.path}</span>
        </div>
      </div>

      <div className="grid md:grid-cols-[200px_1fr]">
        {/* Navegación lateral */}
        <nav aria-label="Secciones del portal" className="border-b border-border-subtle md:border-b-0 md:border-r">
          <div className="hidden items-center gap-2.5 border-b border-border-subtle px-4 py-4 md:flex">
            <NexusMark className="h-6 w-6" animated={false} spinning={false} />
            <div className="leading-tight">
              <div className="text-xs font-medium">Energía Andina</div>
              <div className="text-2xs text-foreground-subtle">Portal de inspecciones</div>
            </div>
          </div>
          <ul className="grid grid-cols-4 md:flex md:flex-col md:py-2" role="tablist" aria-orientation="vertical">
            {VIEWS.map((v) => {
              const active = v.id === view;
              return (
                <li key={v.id} className="relative">
                  {active && (
                    <motion.span
                      layoutId="portal-nav"
                      className="absolute inset-0 border-b-2 border-accent-primary bg-accent-deep md:border-b-0 md:border-l-2"
                      transition={spring("actuator")}
                    />
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="portal-view"
                    onClick={() => go(v.id)}
                    className={cn(
                      "relative flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[11px] transition-colors duration-spring-actuator ease-spring-actuator md:flex-row md:gap-2.5 md:px-4 md:text-sm",
                      active ? "text-foreground" : "text-foreground-muted hover:text-foreground",
                    )}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
                      <path d={v.icon} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    </svg>
                    {v.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden px-4 pb-4 pt-8 md:block">
            <div className="text-2xs text-foreground-subtle">Sesión</div>
            <div className="mt-1 text-xs">María Rojas</div>
            <div className="text-2xs text-foreground-subtle">Inspectora</div>
          </div>
        </nav>

        {/* Contenido */}
        <div className="flex flex-col md:min-h-[520px]">
          <div className="border-b border-border-subtle px-4 py-3 md:px-5 md:py-4">
            <div className="text-base font-medium md:text-lg">{TITLES[view].title}</div>
            <div className="text-xs text-foreground-subtle">{TITLES[view].subtitle}</div>
          </div>
          <div id="portal-view" role="tabpanel" className="relative flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                className="h-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={spring("gimbal")}
              >
                {view === "overview" && <PortalOverview />}
                {view === "findings" && <AnomalyInspector />}
                {view === "model" && <PointCloudViewer />}
                {view === "reports" && <PortalReports />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
