"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AssetHealth, PortalAsset, PortalProject } from "@/contracts/platform";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { createLogger } from "@/lib/observability/logger";
import { useDict } from "@/i18n/LocaleProvider";

const log = createLogger("ui.interaction");

const HEALTH: Record<AssetHealth, { color: string; text: string }> = {
  ok: { color: "hsl(var(--accent-muted))", text: "text-foreground-muted" },
  observed: { color: "hsl(var(--signal-caution))", text: "text-signal-caution" },
  critical: { color: "hsl(var(--signal-critical))", text: "text-signal-critical" },
};

const MAP_W = 600;
const MAP_H = 340;

function AssetGlyph({ project, asset, active }: { project: PortalProject["id"]; asset: PortalAsset; active: boolean }) {
  const c = HEALTH[asset.health].color;
  const s = active ? 1.5 : 1;
  if (project === "wind") {
    return (
      <g transform={`scale(${s})`}>
        <line x1={0} y1={0} x2={0} y2={9} stroke="hsl(var(--foreground) / 0.5)" strokeWidth={1} />
        {[0, 120, 240].map((a) => (
          <line key={a} x1={0} y1={0} x2={0} y2={-7} stroke={c} strokeWidth={1.6} strokeLinecap="round" transform={`rotate(${a})`} />
        ))}
        <circle r={1.6} fill="hsl(var(--foreground))" />
      </g>
    );
  }
  if (project === "line") {
    return (
      <g transform={`scale(${s})`}>
        <path d="M0 -7 L5 6 L-5 6 Z" fill="hsl(var(--background-base))" stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    );
  }
  return <rect x={-14 * s} y={-5 * s} width={28 * s} height={10 * s} fill={c} fillOpacity={0.25} stroke={c} strokeWidth={1} />;
}

function ProjectMap({ project, selected, onSelect }: { project: PortalProject; selected: string | null; onSelect: (id: string | null) => void }) {
  const t = useDict().portal;
  const asset = project.assets.find((a) => a.id === selected) ?? null;
  const pts = project.assets.map((a) => ({ ...a, px: a.x * MAP_W, py: a.y * MAP_H }));

  return (
    <div className="relative md:h-full">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="aspect-[600/340] w-full md:aspect-auto md:h-full" role="img" aria-label={`${t.mapOf} ${project.name}`}>
        <defs>
          <pattern id="portal-grid" width={30} height={30} patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="hsl(var(--border-subtle))" strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#portal-grid)" />
        {Array.from({ length: 7 }, (_, i) => (
          <path
            key={i}
            d={`M -10 ${60 + i * 40} C 120 ${30 + i * 42}, 260 ${100 + i * 34}, 380 ${70 + i * 40} S 560 ${90 + i * 38}, 620 ${60 + i * 41}`}
            fill="none"
            stroke="hsl(var(--border-strong) / 0.45)"
            strokeWidth={0.8}
          />
        ))}
        {project.id === "line" && (
          <polyline
            points={pts.map((p) => `${p.px},${p.py}`).join(" ")}
            fill="none"
            stroke="hsl(var(--foreground) / 0.35)"
            strokeWidth={1}
          />
        )}
        <AnimatePresence mode="popLayout">
          {pts.map((p, i) => (
            <motion.g
              key={`${project.id}-${p.id}`}
              initial={{ opacity: 0, x: p.px, y: p.py + 8 }}
              animate={{ opacity: 1, x: p.px, y: p.py }}
              exit={{ opacity: 0 }}
              transition={{ ...spring("gimbal"), delay: i * 0.012 }}
              className="cursor-pointer"
              onClick={() => onSelect(p.id === selected ? null : p.id)}
              role="button"
              aria-label={`${p.code}: ${t.health[p.health]}`}
            >
              <circle r={20} fill="transparent" />
              {p.health === "critical" && (
                <circle r={11} fill="none" stroke="hsl(var(--signal-critical) / 0.6)" className="animate-signal-pulse" />
              )}
              <AssetGlyph project={project.id} asset={p} active={p.id === selected} />
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>

      <AnimatePresence>
        {asset && (
          <motion.div
            key={asset.id}
            className="panel absolute right-2 top-2 w-48 p-3 shadow-2xl md:right-3 md:top-3 md:w-52 md:p-4"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={spring("actuator")}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{asset.code}</span>
              <button type="button" onClick={() => onSelect(null)} className="text-foreground-subtle hover:text-foreground" aria-label={t.closeDetail}>
                ×
              </button>
            </div>
            <div className={cn("mt-1 text-xs", HEALTH[asset.health].text)}>{t.health[asset.health]}</div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-foreground-subtle">{t.openFindings}</dt>
                <dd className="font-mono tabular">{asset.openFindings}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-foreground-subtle">{t.lastInspection}</dt>
                <dd className="font-mono tabular">{asset.lastInspection}</dd>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-2 pb-3 pt-1 md:absolute md:bottom-3 md:left-3 md:p-0">
        {(Object.keys(HEALTH) as AssetHealth[]).map((h) => (
          <li key={h} className="flex items-center gap-1.5 text-2xs text-foreground-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEALTH[h].color }} />
            {t.health[h]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PortalOverview() {
  const t = useDict().portal;
  const PORTAL_PROJECTS = t.projects;
  const PORTAL_REPORTS = t.reports;
  const [projectId, setProjectId] = useState<PortalProject["id"]>("wind");
  const [assetId, setAssetId] = useState<string | null>(null);
  const project = PORTAL_PROJECTS.find((p) => p.id === projectId) ?? PORTAL_PROJECTS[0]!;

  const totals = useMemo(() => {
    const all = PORTAL_PROJECTS.flatMap((p) => p.assets);
    const inspected = PORTAL_PROJECTS.reduce((acc, p) => acc + Math.round(p.assets.length * p.progress), 0);
    return {
      inspected,
      assets: all.length,
      open: all.reduce((a, x) => a + x.openFindings, 0),
      critical: PORTAL_PROJECTS.reduce((a, p) => a + p.findingsBySeverity.critical, 0),
      reports: PORTAL_REPORTS.filter((r) => r.status === "published").length,
    };
  }, []);

  const selectProject = (id: PortalProject["id"]) => {
    setProjectId(id);
    setAssetId(null);
    log.info("portal.project_select", { project: id });
  };

  const sev = project.findingsBySeverity;
  const sevMax = Math.max(1, sev.critical, sev.moderate, sev.minor);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 border-b border-border-subtle xl:grid-cols-4">
        {[
          { label: t.kpis.inspected, value: totals.inspected, suffix: ` / ${totals.assets}` },
          { label: t.kpis.open, value: totals.open },
          { label: t.kpis.critical, value: totals.critical, tone: "text-signal-critical" },
          { label: t.kpis.reports, value: totals.reports },
        ].map((k, i) => (
          <div key={k.label} className={cn("p-4 md:p-5", i % 2 === 1 && "border-l border-border-subtle", i > 1 && "max-xl:border-t xl:border-l border-border-subtle")}>
            <div className="text-xs text-foreground-subtle">{k.label}</div>
            <div className={cn("mt-1.5 font-mono text-2xl tabular", k.tone)}>
              <AnimatedNumber value={k.value} />
              {k.suffix && <span className="text-sm text-foreground-subtle">{k.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid flex-1 lg:grid-cols-[1fr_260px]">
        <div className="relative border-b border-border-subtle lg:border-b-0 lg:border-r">
          <div className="flex items-baseline justify-between px-4 pt-4 md:px-5">
            <div>
              <div className="text-sm font-medium">{project.name}</div>
              <div className="text-xs text-foreground-subtle">
                {project.site} · {project.assets.length} {project.assetLabel.toLowerCase()} · {t.lastFlight}: {project.lastFlight.toLowerCase()}
              </div>
            </div>
            <span className="hidden text-2xs text-foreground-subtle md:inline">{t.tapHint}</span>
          </div>
          <div className="px-2 md:h-[330px]">
            <ProjectMap project={project} selected={assetId} onSelect={setAssetId} />
          </div>
        </div>

        <aside className="flex flex-col">
          <div className="px-4 pb-2 pt-4 text-xs text-foreground-subtle">{t.projectsLabel}</div>
          <ul>
            {PORTAL_PROJECTS.map((p) => {
              const active = p.id === project.id;
              return (
                <li key={p.id} className="relative">
                  {active && <motion.span layoutId="portal-project" className="absolute inset-y-0 left-0 w-0.5 bg-accent-primary" transition={spring("actuator")} />}
                  <button
                    type="button"
                    onClick={() => selectProject(p.id)}
                    aria-pressed={active}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors duration-spring-actuator ease-spring-actuator",
                      active ? "bg-surface-raised" : "hover:bg-surface-raised/60",
                    )}
                  >
                    <div className="text-sm leading-snug">{p.name}</div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1 flex-1 bg-border-subtle">
                        <motion.div
                          className="h-full origin-left bg-accent-primary"
                          initial={false}
                          animate={{ scaleX: p.progress }}
                          transition={spring("gimbal")}
                        />
                      </div>
                      <span className="font-mono text-2xs tabular text-foreground-subtle">{Math.round(p.progress * 100)} %</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto border-t border-border-subtle p-4">
            <div className="mb-3 text-xs text-foreground-subtle">{t.projectFindings}</div>
            {(
              [
                [t.sevCritical, sev.critical, "bg-signal-critical"],
                [t.sevModerate, sev.moderate, "bg-signal-caution"],
                [t.sevMinor, sev.minor, "bg-telemetry-active"],
              ] as const
            ).map(([label, n, color]) => (
              <div key={label} className="mb-2 grid grid-cols-[72px_1fr_24px] items-center gap-2 text-xs">
                <span className="text-foreground-muted">{label}</span>
                <div className="h-1.5 bg-border-subtle">
                  <motion.div
                    className={cn("h-full origin-left", color)}
                    initial={false}
                    animate={{ scaleX: n / sevMax }}
                    transition={spring("gimbal")}
                  />
                </div>
                <span className="text-right font-mono tabular">{n}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
