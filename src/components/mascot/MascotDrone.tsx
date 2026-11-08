"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type MascotMood = "idle" | "attentive" | "pointing" | "happy" | "sleeping";

interface Props {
  readonly mood: MascotMood;
  /** Dirección de la mirada, -1..1 en cada eje. */
  readonly look?: { x: number; y: number };
  readonly className?: string;
}

const ROTORS = [
  { x: -34, y: -34, dir: 1 },
  { x: 34, y: -34, dir: -1 },
  { x: -34, y: 34, dir: -1 },
  { x: 34, y: 34, dir: 1 },
] as const;

/**
 * Mascota: dron en X derivado del isotipo NEXUS. El núcleo central es el ojo;
 * se expresa con la mirada, el parpadeo, la inclinación y la velocidad de los
 * rotores. Solo SVG + resortes de `motion`.
 */
export function MascotDrone({ mood, look = { x: 0, y: 0 }, className }: Props) {
  const reduced = useReducedMotion();
  const [blink, setBlink] = useState(false);

  // Parpadeo a intervalos irregulares (no al dormir: ya tiene el ojo cerrado).
  useEffect(() => {
    if (reduced || mood === "sleeping") return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 140);
        schedule();
      }, 2600 + Math.random() * 3200);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [mood, reduced]);

  const sleeping = mood === "sleeping";
  const eyeOpen = sleeping ? 0.12 : blink ? 0.08 : 1;
  const tilt = mood === "pointing" ? -14 : mood === "attentive" ? look.x * 6 : 0;
  const rotorSpeed = sleeping ? 0 : mood === "attentive" || mood === "pointing" ? 0.7 : mood === "happy" ? 0.45 : 1.3;
  const pupilX = sleeping ? 0 : look.x * 5;
  const pupilY = sleeping ? 2 : look.y * 4;

  return (
    <motion.svg
      viewBox="-60 -60 120 120"
      className={cn("overflow-visible", className)}
      aria-hidden
      animate={reduced || sleeping ? { y: 0, rotate: tilt } : { y: [0, -3, 0], rotate: tilt }}
      transition={
        reduced || sleeping
          ? spring("gimbal")
          : { y: { duration: 2.6, repeat: Infinity, ease: "easeInOut" }, rotate: spring("gimbal") }
      }
    >
      {/* Brazos */}
      {ROTORS.map((r, i) => (
        <line
          key={`arm-${i}`}
          x1={r.x * 0.35}
          y1={r.y * 0.35}
          x2={r.x * 0.72}
          y2={r.y * 0.72}
          stroke="hsl(var(--foreground))"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}

      {/* Rotores */}
      {ROTORS.map((r, i) => (
        <g key={`rotor-${i}`} transform={`translate(${r.x} ${r.y})`}>
          <circle r={13} fill="hsl(var(--surface-layer))" stroke="hsl(var(--foreground))" strokeWidth={3} />
          <g
            className={cn(!reduced && rotorSpeed > 0 && (r.dir > 0 ? "animate-rotor-spin" : "animate-rotor-spin-reverse"))}
            style={{ transformOrigin: "0px 0px", animationDuration: `${rotorSpeed || 1}s` }}
          >
            <path d="M -7.5 -4 A 8.5 8.5 0 0 1 -1 -8.4" stroke="hsl(var(--accent-primary))" strokeWidth={2.6} strokeLinecap="round" fill="none" />
            <path d="M 7.5 4 A 8.5 8.5 0 0 1 1 8.4" stroke="hsl(var(--accent-primary))" strokeWidth={2.6} strokeLinecap="round" fill="none" />
          </g>
          <circle r={1.8} fill="hsl(var(--foreground))" />
        </g>
      ))}

      {/* Cuerpo / ojo */}
      <circle r={21} fill="hsl(var(--surface-layer))" stroke="hsl(var(--foreground))" strokeWidth={3.5} />
      <motion.g
        initial={false}
        animate={{ scaleY: eyeOpen }}
        transition={blink ? { duration: 0.06 } : spring("actuator")}
        style={{ transformOrigin: "0px 0px" }}
      >
        <circle r={13} fill="hsl(var(--accent-deep))" />
        <motion.g initial={false} animate={{ x: pupilX, y: pupilY }} transition={spring("actuator")}>
          <circle r={8.5} fill="hsl(var(--accent-primary))" />
          <circle r={3.6} fill="hsl(var(--background-base))" />
          <circle cx={-3.2} cy={-3.4} r={1.9} fill="hsl(var(--on-accent))" opacity={0.9} />
        </motion.g>
      </motion.g>

      {/* "Zzz" al dormir */}
      {sleeping && !reduced && (
        <motion.text
          x={22}
          y={-26}
          fontSize={12}
          className="font-mono"
          fill="hsl(var(--foreground-subtle))"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: [0, 1, 0], y: [-20, -32, -40] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          z
        </motion.text>
      )}
    </motion.svg>
  );
}
