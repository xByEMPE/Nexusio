"use client";

import type { PaletteName } from "@/lib/blade";
import { cn } from "@/lib/cn";
import { formatC, formatStats } from "./thermal-logic";
import type { ThermalTool, useThermal } from "./useThermal";

const PALETTES: { id: PaletteName; label: string }[] = [
  { id: "hierro", label: "Hierro" },
  { id: "arcoiris", label: "Arcoíris" },
  { id: "gris", label: "Gris" },
];

const seg =
  "inline-flex h-8 items-center rounded-[2px] border border-border-subtle px-2.5 text-xs hover:bg-background-elevated";
const on = "border-foreground bg-background-elevated font-medium";

/** Selector RGB / Térmico: cambia a la foto pareada. */
export function SpectrumSwitch({
  thermalActive,
  rgbId,
  thermalId,
  onGo,
}: {
  thermalActive: boolean;
  rgbId: string | null;
  thermalId: string | null;
  onGo: (id: string) => void;
}) {
  const item = (label: string, pressed: boolean, id: string | null) => (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={!id && !pressed}
      onClick={() => id && !pressed && onGo(id)}
      className={cn(seg, pressed && on)}
    >
      {label}
    </button>
  );
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Espectro"
      data-testid="spectrum-switch"
    >
      {item("RGB", !thermalActive, rgbId)}
      {item("Térmico", thermalActive, thermalId)}
    </div>
  );
}

/** Barra del modo térmico: paleta, rango, temperatura bajo el cursor y herramientas de medición. */
export function ThermalControls({
  t,
  cursorC,
  onThermalTool,
}: {
  t: ReturnType<typeof useThermal>;
  cursorC: number | null;
  onThermalTool: (tool: ThermalTool) => void;
}) {
  if (t.error) {
    return (
      <div
        className="border-b border-border-subtle bg-surface-layer px-3 py-2 text-xs text-amber-500"
        role="alert"
      >
        {t.error}
      </div>
    );
  }
  if (!t.matrix || !t.range || !t.bounds) {
    return (
      <div className="border-b border-border-subtle bg-surface-layer px-3 py-2 text-xs text-foreground-muted">
        Cargando matriz térmica…
      </div>
    );
  }
  const { lo, hi } = t.bounds;
  const clamp = (v: number) => Math.min(Math.max(v, lo), hi);
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle bg-surface-layer px-3 py-2 text-2xs text-foreground-muted"
      data-testid="thermal-controls"
    >
      <div className="flex items-center gap-1" role="group" aria-label="Paleta">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={t.palette === p.id}
            onClick={() => t.setPalette(p.id)}
            className={cn(seg, t.palette === p.id && on)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5">
        Mín {formatC(t.range.min)}
        <input
          type="range"
          min={lo}
          max={hi}
          step={0.5}
          value={clamp(t.range.min)}
          onChange={(e) => t.setMin(Number(e.target.value))}
          className="w-24 accent-current"
          aria-label="Temperatura mínima"
        />
      </label>
      <label className="flex items-center gap-1.5">
        Máx {formatC(t.range.max)}
        <input
          type="range"
          min={lo}
          max={hi}
          step={0.5}
          value={clamp(t.range.max)}
          onChange={(e) => t.setMax(Number(e.target.value))}
          className="w-24 accent-current"
          aria-label="Temperatura máxima"
        />
      </label>
      <button
        type="button"
        className="underline hover:text-foreground"
        onClick={t.resetRange}
      >
        Rango original
      </button>
      <span
        className="tabular text-xs text-foreground"
        data-testid="thermal-cursor"
      >
        Cursor: {formatC(cursorC)}
      </span>
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Medición térmica"
      >
        <button
          type="button"
          aria-pressed={t.tool === "box"}
          className={cn(seg, t.tool === "box" && on)}
          onClick={() => onThermalTool(t.tool === "box" ? "off" : "box")}
          title="Dos clics: esquinas del recuadro"
        >
          Recuadro °C
        </button>
        <button
          type="button"
          aria-pressed={t.tool === "line"}
          className={cn(seg, t.tool === "line" && on)}
          onClick={() => onThermalTool(t.tool === "line" ? "off" : "line")}
          title="Dos clics: extremos de la línea"
        >
          Línea °C
        </button>
      </div>
      {t.stats && (
        <span
          className="tabular text-xs text-foreground"
          data-testid="thermal-stats"
        >
          {formatStats(t.stats)}
        </span>
      )}
    </div>
  );
}
