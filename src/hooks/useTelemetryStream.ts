"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { TelemetryFrameSchema, type TelemetryFrame, type TelemetryStreamState } from "@/contracts/telemetry";
import { createLogger } from "@/lib/observability/logger";
import { FlightSimulator, DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from "@/services/telemetry/simulator";

const log = createLogger("telemetry.stream");

interface Options {
  readonly active: boolean;
  readonly hz?: number;
  readonly historySize?: number;
  readonly config?: SimulatorConfig;
}

/**
 * Suscribe la UI a un flujo de tramas de telemetría.
 *
 * - Valida contra `TelemetryFrameSchema` una de cada `VALIDATE_EVERY` tramas
 *   para detectar regresiones del adaptador sin penalizar el render.
 * - Detecta huecos de secuencia (`seq`) y los reporta como `frame.gap`.
 * - Con `prefers-reduced-motion` reduce la frecuencia a 2 Hz.
 * - Se detiene cuando `active` es false (fuera de viewport o pestaña oculta).
 */
const VALIDATE_EVERY = 50;

export function useTelemetryStream({
  active,
  hz = 10,
  historySize = 120,
  config = DEFAULT_SIMULATOR_CONFIG,
}: Options): TelemetryStreamState & { simulator: FlightSimulator } {
  const reduced = useReducedMotion();
  const effectiveHz = reduced ? 2 : hz;
  const simRef = useRef<FlightSimulator | null>(null);
  if (simRef.current === null) simRef.current = new FlightSimulator(config);

  const [state, setState] = useState<TelemetryStreamState>({
    frame: null,
    history: [],
    droppedFrames: 0,
    status: "idle",
  });

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;

    if (!active) {
      setState((s) => (s.status === "streaming" ? { ...s, status: "paused" } : s));
      return;
    }

    const span = log.span("stream.session", { hz: effectiveHz, source: "simulator" });
    log.info("stream.start", { aircraftSn: config.aircraftSn, hz: effectiveHz });

    const interval = 1000 / effectiveHz;
    let lastSeq = -1;
    let frames = 0;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(250, now - last);
      last = now;
      acc += elapsed;
      if (acc >= interval) {
        const dt = acc / 1000;
        acc = 0;
        const frame: TelemetryFrame = sim.step(dt * (reduced ? 1 : 1.6));
        frames += 1;

        if (frames % VALIDATE_EVERY === 0) {
          const parsed = TelemetryFrameSchema.safeParse(frame);
          if (!parsed.success) {
            log.error("frame.invalid", { seq: frame.seq, issues: parsed.error.issues.length });
          }
        }

        const gap = lastSeq >= 0 && frame.seq !== lastSeq + 1 && frame.seq !== 0;
        if (gap) log.warn("frame.gap", { expected: lastSeq + 1, received: frame.seq });
        lastSeq = frame.seq;

        setState((s) => {
          const history = s.history.length >= historySize ? s.history.slice(1) : s.history.slice();
          history.push(frame);
          return {
            frame,
            history,
            droppedFrames: s.droppedFrames + (gap ? 1 : 0),
            status: "streaming",
          };
        });
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      span.end({ frames });
    };
  }, [active, effectiveHz, historySize, reduced, config.aircraftSn]);

  return { ...state, simulator: simRef.current };
}
