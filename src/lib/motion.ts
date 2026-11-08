import type { Transition, Variants } from "motion/react";
import { springs, type SpringName } from "./motion-tokens";

export function spring(name: SpringName): Transition {
  return { type: "spring", ...springs[name] };
}

/** Entrada de sección: desplazamiento corto + opacidad, con resorte `gimbal`. */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: spring("gimbal") },
};

export const staggerChildren = (stagger = 0.06, delay = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Variante sin desplazamiento para `prefers-reduced-motion`. */
export const revealStatic: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};
