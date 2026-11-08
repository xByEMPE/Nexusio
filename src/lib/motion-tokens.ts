/**
 * Fuente única de verdad para las físicas de movimiento.
 *
 * Los mismos parámetros de resorte alimentan:
 *  - `motion/react` (transiciones JS con física real), vía `springs`.
 *  - Tailwind (`ease-spring-*` / `duration-spring-*`), vía `cssSpring()`, que
 *    integra numéricamente el oscilador amortiguado y lo serializa como
 *    función CSS `linear()` para micro-interacciones sin JavaScript.
 *
 * Este archivo no debe importar nada de React ni del DOM: lo consume
 * `tailwind.config.ts` en tiempo de build.
 */

export interface SpringSpec {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

export const springs = {
  /** Respuesta de control: hover, toggles, foco. Sin sobreoscilación visible. */
  actuator: { stiffness: 520, damping: 38, mass: 1 },
  /** Paneles y tarjetas que entran en escena. Ligera sobreoscilación. */
  gimbal: { stiffness: 260, damping: 26, mass: 1 },
  /** Grandes desplazamientos (cambio de módulo, transiciones de página). */
  airframe: { stiffness: 140, damping: 22, mass: 1.1 },
  /** Desplazamiento a secciones: levemente sobreamortiguado, sin rebote al llegar. */
  navigation: { stiffness: 200, damping: 30, mass: 1 },
  /** Lecturas de telemetría: seguimiento suave de valores numéricos. */
  telemetry: { stiffness: 90, damping: 20, mass: 0.8 },
} as const satisfies Record<string, SpringSpec>;

export type SpringName = keyof typeof springs;

export interface CssSpring {
  readonly easing: string;
  readonly durationMs: number;
}

/**
 * Integra x'' = (-k(x-1) - c·x') / m desde x=0 hasta reposo y devuelve
 * una curva `linear()` muestreada uniformemente más la duración de asentamiento.
 */
export function cssSpring(spec: SpringSpec, samples = 48): CssSpring {
  const dt = 1 / 1000;
  const restDelta = 0.0005;
  const maxSeconds = 4;
  const trace: number[] = [];
  let x = 0;
  let v = 0;
  let t = 0;

  while (t < maxSeconds) {
    const a = (-spec.stiffness * (x - 1) - spec.damping * v) / spec.mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    trace.push(x);
    if (Math.abs(1 - x) < restDelta && Math.abs(v) < restDelta) break;
  }

  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const idx = Math.min(trace.length - 1, Math.round((i / samples) * (trace.length - 1)));
    const value = i === samples ? 1 : (trace[idx] ?? 1);
    points.push(Number(value.toFixed(4)).toString());
  }

  return {
    easing: `linear(${points.join(", ")})`,
    durationMs: Math.round(trace.length * dt * 1000),
  };
}

export const cssSprings: Record<SpringName, CssSpring> = {
  actuator: cssSpring(springs.actuator),
  gimbal: cssSpring(springs.gimbal),
  airframe: cssSpring(springs.airframe),
  navigation: cssSpring(springs.navigation),
  telemetry: cssSpring(springs.telemetry),
};
