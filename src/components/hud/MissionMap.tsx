"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { TelemetryFrame } from "@/contracts/telemetry";
import type { FlightSimulator } from "@/services/telemetry/simulator";
import { spring } from "@/lib/motion";
import { useDict } from "@/i18n/LocaleProvider";

interface Props {
  readonly simulator: FlightSimulator;
  readonly frame: TelemetryFrame | null;
  readonly history: readonly TelemetryFrame[];
}

const PAD = 40;

/**
 * Vista en planta de la misión: ruta planificada, traza ejecutada, huella de
 * captura y posición actual.
 */
export function MissionMap({ simulator, frame, history }: Props) {
  const reduced = useReducedMotion();
  const t = useDict().hud;
  const path = simulator.pathLocal;

  const bounds = useMemo(() => {
    const es = path.map((p) => p.e);
    const ns = path.map((p) => p.n);
    return {
      minE: Math.min(...es) - PAD,
      maxE: Math.max(...es) + PAD,
      minN: Math.min(...ns) - PAD,
      maxN: Math.max(...ns) + PAD + 36,
    };
  }, [path]);

  const width = bounds.maxE - bounds.minE;
  const height = bounds.maxN - bounds.minN;
  const toX = (e: number) => e - bounds.minE;
  const toY = (n: number) => bounds.maxN - n;

  const trail = history
    .map((f) => simulator.toLocal(f.position))
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.e).toFixed(1)} ${toY(p.n).toFixed(1)}`)
    .join(" ");

  const current = frame ? simulator.toLocal(frame.position) : { e: 0, n: 0 };
  const planned = path.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.e)} ${toY(p.n)}`).join(" ");
  const nextWp = frame ? path[frame.mission.waypointIndex] : undefined;

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        role="img"
        aria-label={t.mapAria}
      >
        <defs>
          <pattern id="map-grid" width={25} height={25} patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="hsl(var(--border-subtle))" strokeWidth={0.6} />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#map-grid)" />

        <path d={planned} fill="none" stroke="hsl(var(--border-strong))" strokeWidth={1.2} strokeDasharray="4 5" />
        {path.map((p, i) => (
          <rect
            key={i}
            x={toX(p.e) - 2.5}
            y={toY(p.n) - 2.5}
            width={5}
            height={5}
            fill={frame && i < frame.mission.waypointIndex ? "hsl(var(--accent-primary))" : "hsl(var(--background-base))"}
            stroke="hsl(var(--foreground-subtle))"
            strokeWidth={0.8}
          />
        ))}

        {trail && <path d={trail} fill="none" stroke="hsl(var(--accent-primary))" strokeWidth={2} />}

        {nextWp && frame && frame.phase !== "landing" && frame.phase !== "preflight" && (
          <line
            x1={toX(current.e)}
            y1={toY(current.n)}
            x2={toX(nextWp.e)}
            y2={toY(nextWp.n)}
            stroke="hsl(var(--telemetry-active) / 0.5)"
            strokeWidth={0.8}
          />
        )}

        <g transform={`translate(${toX(0)} ${toY(0)})`}>
          <circle r={9} fill="hsl(var(--background-base))" stroke="hsl(var(--foreground-muted))" strokeWidth={1} />
          <text y={3} textAnchor="middle" fontSize={8} fill="hsl(var(--foreground-muted))" className="font-mono">
            H
          </text>
        </g>

        {frame && (
          <motion.g
            initial={false}
            animate={{ x: toX(current.e), y: toY(current.n) }}
            transition={reduced ? { duration: 0 } : spring("telemetry")}
          >
            <g transform={`rotate(${frame.attitude.yaw})`}>
              {frame.phase === "survey" && (
                <rect
                  x={-22}
                  y={-16}
                  width={44}
                  height={32}
                  fill="hsl(var(--accent-primary) / 0.12)"
                  stroke="hsl(var(--accent-primary) / 0.5)"
                  strokeWidth={0.6}
                />
              )}
              <path d="M 0 -9 L 6 7 L 0 3.5 L -6 7 Z" fill="hsl(var(--foreground))" />
            </g>
          </motion.g>
        )}

      </svg>

      <div className="pointer-events-none absolute right-2 top-2 font-mono text-2xs text-foreground-subtle">
        {t.grid}
      </div>
    </div>
  );
}
