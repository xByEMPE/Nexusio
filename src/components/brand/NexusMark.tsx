"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Isotipo NEXUS: cuadricóptero en X dentro de un anillo orbital.
 * Geometría tomada del logotipo (1080 px) y reescalada a un viewBox centrado.
 * Al montar reproduce la secuencia del video de marca: trazado de brazos,
 * cierre de rotores y giro de los arcos de hélice.
 */

const ROTORS = [
  { x: -140, y: -140, dir: 1 },
  { x: 140, y: -140, dir: -1 },
  { x: -140, y: 140, dir: -1 },
  { x: 140, y: 140, dir: 1 },
] as const;

const ROTOR_R = 48;
const ARC_R = 30;

function arcPath(r: number, startDeg: number, sweepDeg: number) {
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = ((startDeg + sweepDeg) * Math.PI) / 180;
  const x0 = (r * Math.cos(a0)).toFixed(2);
  const y0 = (r * Math.sin(a0)).toFixed(2);
  const x1 = (r * Math.cos(a1)).toFixed(2);
  const y1 = (r * Math.sin(a1)).toFixed(2);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

export interface NexusMarkProps {
  readonly className?: string;
  readonly animated?: boolean;
  readonly spinning?: boolean;
  readonly title?: string;
}

export function NexusMark({ className, animated = true, spinning = true, title = "NEXUS" }: NexusMarkProps) {
  const reduced = useReducedMotion();
  const play = animated && !reduced;
  const draw = (delay: number) =>
    play
      ? {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { pathLength: { type: "spring" as const, stiffness: 60, damping: 18, delay }, opacity: { duration: 0.01, delay } },
        }
      : {};

  return (
    <svg
      viewBox="-210 -210 420 420"
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={title}
      fill="none"
    >
      <motion.circle r={198} stroke="hsl(var(--border-strong))" strokeWidth={2} {...draw(0)} />

      {ROTORS.map((r, i) => {
        const len = Math.hypot(r.x, r.y);
        const ux = r.x / len;
        const uy = r.y / len;
        return (
          <motion.line
            key={`arm-${i}`}
            x1={ux * 26}
            y1={uy * 26}
            x2={r.x - ux * ROTOR_R}
            y2={r.y - uy * ROTOR_R}
            stroke="hsl(var(--foreground))"
            strokeWidth={4}
            strokeLinecap="round"
            {...draw(0.15 + i * 0.05)}
          />
        );
      })}

      {ROTORS.map((r, i) => (
        <g key={`rotor-${i}`} transform={`translate(${r.x} ${r.y})`}>
          <circle r={ROTOR_R + 6} fill="hsl(var(--background-base))" />
          <motion.circle
            r={ROTOR_R}
            stroke="hsl(var(--foreground))"
            strokeWidth={4.5}
            fill="hsl(var(--background-base))"
            {...draw(0.4 + i * 0.08)}
          />
          <g
            className={cn(spinning && !reduced && (r.dir > 0 ? "animate-rotor-spin" : "animate-rotor-spin-reverse"))}
            style={{ transformOrigin: "0px 0px", animationDuration: `${2.4 + i * 0.15}s` }}
          >
            <path d={arcPath(ARC_R, 150, 75)} stroke="hsl(var(--accent-primary))" strokeWidth={4} strokeLinecap="round" />
            <path d={arcPath(ARC_R, -30, 75)} stroke="hsl(var(--accent-primary))" strokeWidth={4} strokeLinecap="round" />
          </g>
          <circle r={4.5} fill="hsl(var(--foreground))" />
          <circle r={2} fill="hsl(var(--background-base))" />
        </g>
      ))}

      <circle r={24} stroke="hsl(var(--foreground))" strokeWidth={4} fill="hsl(var(--background-base))" />
      <motion.circle
        r={10}
        fill="hsl(var(--accent-primary))"
        initial={play ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 14, delay: play ? 0.9 : 0 }}
      />
    </svg>
  );
}

export function Wordmark({ className }: { readonly className?: string }) {
  return (
    <span className={cn("font-display font-medium uppercase tracking-wordmark", className)}>NEXUS</span>
  );
}
