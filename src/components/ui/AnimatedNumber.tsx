"use client";

import { useEffect, useRef } from "react";
import { useInView, useReducedMotion, useSpring } from "motion/react";
import { springs } from "@/lib/motion-tokens";

interface Props {
  readonly value: number;
  readonly format?: (n: number) => string;
  readonly className?: string;
}

/**
 * Número que se desplaza hacia su valor con el resorte `telemetry`.
 * Escribe directamente en el nodo de texto: no provoca renders por fotograma.
 */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString("es-CL"), className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const spring = useSpring(0, springs.telemetry);

  useEffect(() => {
    if (!inView) return;
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [inView, reduced, spring, value]);

  useEffect(
    () =>
      spring.on("change", (v) => {
        if (ref.current) ref.current.textContent = format(v);
      }),
    [spring, format],
  );

  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}
