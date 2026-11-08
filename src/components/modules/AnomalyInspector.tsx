"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { INSPECTION_FRAMES } from "@/content/demo-data";
import type { Finding, Severity } from "@/contracts/platform";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { fixed } from "@/lib/format";
import { spring } from "@/lib/motion";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("ui.interaction");

type Sensor = "zoom" | "thermal";
type Review = "pending" | "confirmed" | "dismissed";

const SEVERITY: Record<Severity, { label: string; text: string; stroke: string }> = {
  critical: { label: "Crítico", text: "text-signal-critical", stroke: "hsl(var(--signal-critical))" },
  moderate: { label: "Moderado", text: "text-signal-caution", stroke: "hsl(var(--signal-caution))" },
  minor: { label: "Menor", text: "text-telemetry-active", stroke: "hsl(var(--telemetry-active))" },
  info: { label: "Info", text: "text-foreground-muted", stroke: "hsl(var(--foreground-muted))" },
};

const W = 800;
const H = 500;

/** Ilustración vectorial de la parte superior de una torre de alta tensión. */
function TowerArt({ thermal }: { thermal: boolean }) {
  const steel = thermal ? "hsl(0 0% 38%)" : "hsl(var(--foreground) / 0.78)";
  const thin = thermal ? "hsl(0 0% 28%)" : "hsl(var(--foreground) / 0.4)";
  const insulator = thermal ? "hsl(0 0% 45%)" : "hsl(var(--telemetry-active) / 0.8)";

  const arms = [
    { y: 130, span: 250 },
    { y: 230, span: 300 },
  ];
  const strings = [
    { x: 160, y: 230 },
    { x: 395, y: 230 },
    { x: 650, y: 230 },
  ];

  return (
    <g fill="none" strokeLinecap="round">
      {/* Fuste reticulado */}
      <path d={`M 360 40 L 300 ${H} M 440 40 L 500 ${H}`} stroke={steel} strokeWidth={4} />
      {Array.from({ length: 9 }, (_, i) => {
        const y0 = 40 + i * 52;
        const y1 = y0 + 52;
        const l0 = 360 - (y0 - 40) * (60 / 460);
        const r0 = 440 + (y0 - 40) * (60 / 460);
        const l1 = 360 - (y1 - 40) * (60 / 460);
        const r1 = 440 + (y1 - 40) * (60 / 460);
        return (
          <g key={i} stroke={thin} strokeWidth={1.5}>
            <line x1={l0} y1={y0} x2={r1} y2={y1} />
            <line x1={r0} y1={y0} x2={l1} y2={y1} />
            <line x1={l0} y1={y0} x2={r0} y2={y0} />
          </g>
        );
      })}

      {/* Crucetas */}
      {arms.map((a) => (
        <g key={a.y}>
          <path
            d={`M ${400 - a.span} ${a.y} L ${400 + a.span} ${a.y} M ${400 - a.span} ${a.y} L 360 ${a.y - 34} M ${400 + a.span} ${a.y} L 440 ${a.y - 34}`}
            stroke={steel}
            strokeWidth={3}
          />
          {Array.from({ length: 8 }, (_, i) => {
            const x = 400 - a.span + (i * (a.span * 2)) / 7;
            return <line key={i} x1={x} y1={a.y} x2={x + (x < 400 ? 16 : -16)} y2={a.y - 20} stroke={thin} strokeWidth={1.2} />;
          })}
        </g>
      ))}

      {/* Cable de guardia */}
      <path d={`M 0 52 Q 400 30 ${W} 52`} stroke={thin} strokeWidth={1.5} />
      <path d="M 360 40 L 400 22 L 440 40" stroke={steel} strokeWidth={3} />

      {/* Cadenas de aisladores y conductores */}
      {strings.map((s, si) => (
        <g key={si}>
          {Array.from({ length: 9 }, (_, i) => (
            <ellipse key={i} cx={s.x} cy={s.y + 14 + i * 9.5} rx={11} ry={3.2} stroke={insulator} strokeWidth={1.6} />
          ))}
          <line x1={s.x} y1={s.y} x2={s.x} y2={s.y + 104} stroke={steel} strokeWidth={1.5} />
          <path d={`M ${s.x - 14} ${s.y + 104} h 28 v 8 h -28 z`} stroke={steel} strokeWidth={1.5} />
          <path
            d={`M 0 ${s.y + 128 + si * 4} Q ${s.x} ${s.y + 104} ${W} ${s.y + 132 - si * 3}`}
            stroke={steel}
            strokeWidth={2.2}
          />
        </g>
      ))}

      {/* Nido */}
      <path d="M 552 214 q 18 -14 34 -2 q 14 -10 26 2 l -8 12 h -44 z" stroke={steel} strokeWidth={1.4} />
    </g>
  );
}

function ThermalOverlay() {
  return (
    <g>
      <defs>
        <radialGradient id="hot-a">
          <stop offset="0%" stopColor="hsl(var(--foreground))" />
          <stop offset="25%" stopColor="hsl(var(--signal-caution))" />
          <stop offset="60%" stopColor="hsl(var(--signal-critical) / 0.5)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="hot-b">
          <stop offset="0%" stopColor="hsl(var(--signal-caution))" />
          <stop offset="60%" stopColor="hsl(var(--signal-critical) / 0.25)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx={0.2 * W} cy={0.675 * H} r={42} fill="url(#hot-a)" />
      <circle cx={0.85 * W} cy={0.665 * H} r={30} fill="url(#hot-b)" />
    </g>
  );
}

export function AnomalyInspector() {
  const [sensor, setSensor] = useState<Sensor>("zoom");
  const frame = INSPECTION_FRAMES[sensor];
  const [selectedId, setSelectedId] = useState<string>(frame.findings[0]?.id ?? "");
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  const selected: Finding | undefined = frame.findings.find((f) => f.id === selectedId) ?? frame.findings[0];

  const changeSensor = (s: Sensor) => {
    setSensor(s);
    setSelectedId(INSPECTION_FRAMES[s].findings[0]?.id ?? "");
    log.info("anomaly.sensor", { sensor: s });
  };

  const review = (f: Finding, state: Review) => {
    setReviews((r) => ({ ...r, [f.id]: state }));
    log.info("anomaly.review", { findingId: f.id, code: f.code, state, confidence: f.confidence });
  };

  return (
    <div className="grid h-full lg:grid-cols-[1fr_300px]">
      <div className={cn("relative aspect-[8/5] transition-colors duration-spring-gimbal lg:aspect-auto lg:min-h-[320px]", sensor === "thermal" ? "bg-[hsl(220_30%_6%)]" : "bg-background-base")}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={`${frame.assetLabel}, imagen ${sensor === "zoom" ? "zoom RGB" : "térmica"}`}>
          <rect width={W} height={H} fill={sensor === "thermal" ? "hsl(220 30% 6%)" : "hsl(var(--background-base))"} />
          <TowerArt thermal={sensor === "thermal"} />
          {sensor === "thermal" && <ThermalOverlay />}

          {frame.findings.map((f) => {
            const active = f.id === selected?.id;
            const state = reviews[f.id] ?? "pending";
            const sev = SEVERITY[f.severity];
            return (
              <motion.g
                key={f.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(f.id)}
                initial={{ opacity: 0 }}
                animate={{ opacity: state === "dismissed" ? 0.25 : 1 }}
                transition={spring("actuator")}
              >
                <motion.rect
                  x={f.bbox.x * W}
                  y={f.bbox.y * H}
                  width={f.bbox.w * W}
                  height={f.bbox.h * H}
                  fill="transparent"
                  stroke={sev.stroke}
                  strokeDasharray={state === "pending" ? "5 4" : undefined}
                  animate={{ strokeWidth: active ? 2.4 : 1.2, scale: active ? 1.06 : 1 }}
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  transition={spring("actuator")}
                />
                <text
                  x={f.bbox.x * W}
                  y={f.bbox.y * H - 6}
                  fontSize={11}
                  fill={sev.stroke}
                  className="font-mono"
                >
                  {f.code} · {Math.round(f.confidence * 100)}%
                </text>
              </motion.g>
            );
          })}
        </svg>

        <div className="absolute left-3 top-3">
          <SegmentedControl<Sensor>
            size="sm"
            label="Sensor"
            value={sensor}
            onChange={changeSensor}
            options={[
              { value: "zoom", label: "Zoom RGB" },
              { value: "thermal", label: "Térmico" },
            ]}
          />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-2xs text-foreground-subtle">
          {frame.id} · GSD {fixed(frame.gsdCmPx, 2)} cm/px
        </div>
      </div>

      <aside className="flex flex-col border-t border-border-subtle lg:border-l lg:border-t-0">
        <div className="border-b border-border-subtle p-4">
          <div className="label-caps">Activo</div>
          <div className="mt-1 text-sm">{frame.assetLabel}</div>
        </div>
        <ul className="divide-y divide-border-subtle" aria-label="Detecciones">
          {frame.findings.map((f) => {
            const active = f.id === selected?.id;
            const state = reviews[f.id] ?? "pending";
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors duration-spring-actuator ease-spring-actuator",
                    active ? "bg-surface-raised" : "hover:bg-surface-raised/60",
                  )}
                >
                  <span>
                    <span className={cn("font-mono text-2xs uppercase tracking-label", SEVERITY[f.severity].text)}>
                      {SEVERITY[f.severity].label}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug">{f.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-foreground-subtle">
                    {state === "pending" ? "Pendiente" : state === "confirmed" ? "Confirmado" : "Descartado"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              className="mt-auto border-t border-border-subtle p-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring("gimbal")}
            >
              <dl className="grid grid-cols-2 gap-3 font-mono text-2xs">
                <div>
                  <dt className="label-caps">Código</dt>
                  <dd className="mt-1 text-foreground">{selected.code}</dd>
                </div>
                <div>
                  <dt className="label-caps">Confianza</dt>
                  <dd className="mt-1 tabular text-foreground">{fixed(selected.confidence * 100, 1)} %</dd>
                </div>
                <div className="col-span-2">
                  <dt className="label-caps">Componente</dt>
                  <dd className="mt-1 text-foreground-muted">{selected.component}</dd>
                </div>
                {selected.measurement && (
                  <div className="col-span-2">
                    <dt className="label-caps">Medición</dt>
                    <dd className="mt-1 tabular text-signal-caution">
                      +{fixed(selected.measurement.value, 1)} {selected.measurement.unit}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => review(selected, "confirmed")}
                  className="rounded-[2px] border border-accent-primary/70 bg-accent-deep px-3 py-2 text-xs transition-colors duration-spring-actuator ease-spring-actuator hover:bg-accent-primary hover:text-on-accent"
                >
                  Confirmar hallazgo
                </button>
                <button
                  type="button"
                  onClick={() => review(selected, "dismissed")}
                  className="rounded-[2px] border border-border-strong px-3 py-2 text-xs text-foreground-muted transition-colors duration-spring-actuator ease-spring-actuator hover:text-foreground"
                >
                  Descartar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}
