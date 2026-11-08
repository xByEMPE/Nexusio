"use client";

import { useRef, useState } from "react";
import type { FlightPhase, TelemetryFrame } from "@/contracts/telemetry";
import { useTelemetryStream } from "@/hooks/useTelemetryStream";
import { useInViewport } from "@/hooks/useInViewport";
import { usePageVisible } from "@/hooks/usePageVisible";
import { createLogger } from "@/lib/observability/logger";
import { cn } from "@/lib/cn";
import { fixed, heading, signed } from "@/lib/format";
import { MissionMap } from "./MissionMap";
import { Sparkline } from "./Sparkline";

const uiLog = createLogger("ui.interaction");

const PHASE_LABEL: Record<FlightPhase, string> = {
  preflight: "PREVUELO",
  takeoff: "DESPEGUE",
  transit: "TRÁNSITO",
  survey: "LEVANTAMIENTO",
  orbit: "ÓRBITA",
  return: "RETORNO",
  landing: "ATERRIZAJE",
};

function Readout({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "active" | "caution";
}) {
  return (
    <div className="flex flex-col gap-1 border-l border-border-subtle pl-3">
      <span className="label-caps">{label}</span>
      <span
        className={cn(
          "font-mono text-lg tabular leading-none",
          tone === "active" && "text-telemetry-active",
          tone === "caution" && "text-signal-caution",
        )}
      >
        {value}
        {unit && <span className="ml-1 text-2xs text-foreground-subtle">{unit}</span>}
      </span>
    </div>
  );
}

function LinkBars({ quality }: { quality: number }) {
  return (
    <span role="img" className="inline-flex items-end gap-[2px]" aria-label={`Enlace ${quality} de 5`}>
      {[1, 2, 3, 4, 5].map((b) => (
        <span
          key={b}
          className={cn("w-[3px]", b <= quality ? "bg-telemetry-active" : "bg-border-strong")}
          style={{ height: 3 + b * 2 }}
        />
      ))}
    </span>
  );
}

/**
 * Visualizador HUD del hero. Consume `useTelemetryStream` y se pausa
 * automáticamente fuera de viewport o con la pestaña oculta.
 */
export function FlightHud() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewport(ref, "120px");
  const pageVisible = usePageVisible();
  const [paused, setPaused] = useState(false);

  const { frame, history, simulator, status } = useTelemetryStream({
    active: inView && pageVisible && !paused,
  });

  const f: TelemetryFrame | null = frame;
  const altSeries = history.map((h) => h.altitudeAgl);
  const speedSeries = history.map((h) => h.groundSpeed);

  const togglePause = () => {
    setPaused((p) => !p);
    uiLog.info("hud.toggle_stream", { paused: !paused });
  };

  return (
    <div ref={ref} className="panel reticle relative flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3 font-mono text-2xs uppercase tracking-label">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              status === "streaming" ? "animate-signal-pulse bg-telemetry-active" : "bg-foreground-subtle",
            )}
            aria-hidden
          />
          <span className="text-foreground-muted">{status === "streaming" ? "En vivo" : "En pausa"}</span>
          <span className="hidden text-foreground-subtle sm:inline">SN {f?.aircraftSn ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePause}
            aria-pressed={paused}
            aria-label={paused ? "Reanudar telemetría" : "Pausar telemetría"}
            className="grid h-8 w-8 place-items-center rounded-[2px] border border-border-subtle text-foreground-muted transition-colors duration-spring-actuator ease-spring-actuator hover:border-foreground/50 hover:text-foreground"
          >
            {paused ? (
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <path d="M3 2l7 4-7 4z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="relative aspect-[4/3] w-full bg-background-base sm:aspect-[16/11]">
        <div className="absolute inset-0">
          <MissionMap simulator={simulator} frame={f} history={history} />
        </div>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 font-mono text-2xs uppercase tracking-label">
          <span className="text-foreground">{f ? PHASE_LABEL[f.phase] : "SIN SEÑAL"}</span>
          <span className="text-foreground-subtle tabular">
            WP {f ? `${String(f.mission.waypointIndex).padStart(2, "0")}/${f.mission.waypointTotal}` : "--/--"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border-subtle px-4 py-4 sm:grid-cols-4">
        <Readout label="ALT AGL" value={f ? fixed(f.altitudeAgl, 1) : "—"} unit="m" />
        <Readout label="VEL. SUELO" value={f ? fixed(f.groundSpeed, 1) : "—"} unit="m/s" />
        <Readout label="VEL. VERT." value={f ? signed(f.verticalSpeed, 1) : "—"} unit="m/s" />
        <Readout label="RUMBO" value={f ? heading(f.attitude.yaw) : "—"} />
        <Readout
          label="BATERÍA"
          value={f ? fixed(f.battery.percent, 0) : "—"}
          unit="%"
          tone={f && f.battery.percent < 30 ? "caution" : "default"}
        />
        <Readout
          label="RTK"
          value={f ? (f.rtk.fix === "fixed" ? "FIX" : f.rtk.fix.toUpperCase()) : "—"}
          unit={f ? `±${fixed(f.rtk.hAccuracyCm, 1)} cm` : undefined}
          tone={f?.rtk.fix === "fixed" ? "active" : "caution"}
        />
        <Readout label="IMÁGENES" value={f ? String(f.mission.capturedImages) : "—"} />
        <div className="flex flex-col gap-1 border-l border-border-subtle pl-3">
          <span className="label-caps">ENLACE / VIDEO</span>
          <span className="flex items-center gap-2 font-mono text-lg leading-none tabular">
            <LinkBars quality={f?.link.quality ?? 0} />
            {f ? fixed(f.link.videoLatencyMs, 0) : "—"}
            <span className="text-2xs text-foreground-subtle">ms</span>
          </span>
        </div>
      </div>

      <footer className="grid grid-cols-2 gap-4 border-t border-border-subtle px-4 py-3">
        <div>
          <div className="label-caps mb-1">Altitud · 12 s</div>
          <Sparkline values={altSeries} min={0} max={130} className="h-7 w-full" />
        </div>
        <div>
          <div className="label-caps mb-1">Velocidad · 12 s</div>
          <Sparkline values={speedSeries} min={0} max={14} className="h-7 w-full" />
        </div>
      </footer>
    </div>
  );
}
