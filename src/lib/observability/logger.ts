import type { EventDomain, LogEvent, LogLevel } from "@/contracts/observability";
import { newSpanId } from "./ids";

/**
 * Logger estructurado isomórfico.
 *
 * - En servidor emite una línea JSON por evento a stdout/stderr (consumible
 *   por Vercel Log Drains, Fluent Bit o el agente de Datadog).
 * - En navegador delega en el sink registrado por `client-sink.ts`, que agrupa
 *   eventos y los envía a `/api/telemetry` con `sendBeacon`.
 */

type Attrs = NonNullable<LogEvent["attrs"]>;
type Sink = (event: LogEvent) => void;

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isServer = typeof window === "undefined";

function resolveMinLevel(): LogLevel {
  const raw = isServer ? process.env.NEXUS_LOG_LEVEL : undefined;
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

const serverSink: Sink = (event) => {
  if (process.env.NEXUS_LOG_SINK === "silent") return;
  const line = JSON.stringify({ service: "nexus-web", ...event });
  if (event.level === "error" || event.level === "warn") console.error(line);
  else console.log(line);
};

let clientSink: Sink | null = null;

export function registerClientSink(sink: Sink): void {
  clientSink = sink;
}

function emit(event: LogEvent): void {
  if (LEVEL_WEIGHT[event.level] < LEVEL_WEIGHT[resolveMinLevel()]) return;
  if (isServer) serverSink(event);
  else clientSink?.(event);
}

export interface Logger {
  log(level: LogLevel, event: string, attrs?: Attrs): void;
  debug(event: string, attrs?: Attrs): void;
  info(event: string, attrs?: Attrs): void;
  warn(event: string, attrs?: Attrs): void;
  error(event: string, attrs?: Attrs): void;
  span(event: string, attrs?: Attrs): Span;
  child(context: { traceId?: string }): Logger;
}

export interface Span {
  readonly spanId: string;
  end(attrs?: Attrs, level?: LogLevel): number;
}

export function createLogger(domain: EventDomain, context: { traceId?: string } = {}): Logger {
  const log: Logger["log"] = (level, event, attrs) =>
    emit({
      ts: new Date().toISOString(),
      level,
      domain,
      event,
      traceId: context.traceId,
      attrs,
    });

  return {
    log,
    debug: (e, a) => log("debug", e, a),
    info: (e, a) => log("info", e, a),
    warn: (e, a) => log("warn", e, a),
    error: (e, a) => log("error", e, a),
    span(event, startAttrs) {
      const spanId = newSpanId();
      const started = performance.now();
      return {
        spanId,
        end(endAttrs, level = "info") {
          const durationMs = Math.round((performance.now() - started) * 100) / 100;
          emit({
            ts: new Date().toISOString(),
            level,
            domain,
            event,
            traceId: context.traceId,
            spanId,
            durationMs,
            attrs: { ...startAttrs, ...endAttrs },
          });
          return durationMs;
        },
      };
    },
    child(next) {
      return createLogger(domain, { ...context, ...next });
    },
  };
}
