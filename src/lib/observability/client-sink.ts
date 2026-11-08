import type { ClientBeacon, LogEvent, WebVital } from "@/contracts/observability";
import { registerClientSink } from "./logger";

/**
 * Cola de eventos del navegador. Agrupa logs y Web Vitals y los vacía:
 *  - cada FLUSH_INTERVAL_MS,
 *  - al alcanzar MAX_BATCH eventos,
 *  - al ocultarse la pestaña (`visibilitychange` / `pagehide`), usando
 *    `sendBeacon` para sobrevivir al cierre de la página.
 */

const ENDPOINT = "/api/telemetry";
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH = 40;

let installed = false;
let sessionId = "";
const events: LogEvent[] = [];
const vitals: WebVital[] = [];

function resolveSessionId(): string {
  const key = "nexus.sid";
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

function flush(): void {
  if (events.length === 0 && vitals.length === 0) return;
  const payload: ClientBeacon = {
    sessionId,
    events: events.splice(0, MAX_BATCH),
    vitals: vitals.splice(0, 20),
  };
  const body = JSON.stringify(payload);
  const sent =
    typeof navigator.sendBeacon === "function" &&
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
  if (!sent) {
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => undefined);
  }
}

export function installClientSink(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  sessionId = resolveSessionId();

  registerClientSink((event) => {
    events.push(event);
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[${event.domain}] ${event.event}`, event.attrs ?? {});
    }
    if (events.length >= MAX_BATCH) flush();
  });

  window.setInterval(flush, FLUSH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

export function recordWebVital(metric: WebVital): void {
  vitals.push(metric);
  if (vitals.length >= 20) flush();
}
