"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DEFAULT_FILTERS, type ImageFilters } from "./ImageStage";

/** `newBox`/`newPolygon`: dibujar un daño nuevo (solo con `capabilities.editFindings`). */
export type Tool = "move" | "crosshair" | "area" | "distance" | "newBox" | "newPolygon";

const FACE_LABEL: Record<string, string> = { TE: "Borde de salida", PS: "Lado de presión", LE: "Borde de ataque", SS: "Lado de succión" };

const btn =
  "inline-flex h-8 items-center justify-center rounded-[2px] border border-border-subtle px-2.5 text-sm hover:bg-background-elevated disabled:cursor-not-allowed disabled:opacity-40";

function ToolButton({ active, onClick, disabled, title, children }: { active: boolean; onClick: () => void; disabled?: boolean; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(btn, "text-xs", active && "border-foreground bg-background-elevated font-medium")}
    >
      {children}
    </button>
  );
}

/** Barra del visor: archivo · pala/cara · navegación · zoom · giro · filtros · herramientas · regla · descarga. */
export function Toolbar({
  fileName,
  blade,
  face,
  position,
  onPrev,
  onNext,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  rotationDeg,
  onRotate,
  filters,
  onFilters,
  tool,
  onTool,
  canMeasure,
  rulerOn,
  rulerAvailable,
  onToggleRuler,
  onDownload,
  downloading,
  editTools,
  panelToggle,
  spectrumSwitch,
}: {
  fileName: string;
  blade: string | null;
  face: string | null;
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  rotationDeg: number;
  onRotate: (deg: number) => void;
  filters: ImageFilters;
  onFilters: (f: ImageFilters) => void;
  tool: Tool;
  onTool: (t: Tool) => void;
  canMeasure: boolean;
  rulerOn: boolean;
  rulerAvailable: boolean;
  onToggleRuler: () => void;
  onDownload: () => void;
  downloading: boolean;
  /** Herramientas de edición (solo personal; se ocultan en pantallas < lg). */
  editTools?: ReactNode;
  /** Botón del panel deslizable (solo en pantallas < lg). */
  panelToggle?: ReactNode;
  /** Selector RGB / Térmico (solo si la foto tiene pareja). */
  spectrumSwitch?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle bg-surface-layer px-3 py-2" role="toolbar" aria-label="Herramientas del visor">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs" title={fileName} data-testid="file-name">
            {fileName}
          </p>
          <p className="text-2xs text-foreground-muted">
            {blade ? `Pala ${blade}` : "Sin pala"}
            {face ? ` · ${face} (${FACE_LABEL[face] ?? face})` : ""}
          </p>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Navegación">
          <button type="button" className={btn} onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Foto anterior" title="Foto anterior (←)">
            ◀
          </button>
          <span className="tabular w-16 text-center text-xs text-foreground-muted" data-testid="position">
            {position.index + 1} / {position.total}
          </span>
          <button type="button" className={btn} onClick={onNext ?? undefined} disabled={!onNext} aria-label="Foto siguiente" title="Foto siguiente (→)">
            ▶
          </button>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button type="button" className={btn} onClick={onZoomOut} aria-label="Alejar" title="Alejar (−)">
            −
          </button>
          <span className="tabular w-14 text-center text-xs text-foreground-muted" data-testid="zoom">
            {Math.round(zoom * 100)} %
          </span>
          <button type="button" className={btn} onClick={onZoomIn} aria-label="Acercar" title="Acercar (+)">
            +
          </button>
          <button type="button" className={cn(btn, "text-xs")} onClick={onFit} title="Ajustar (0)">
            Ajustar
          </button>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Giro">
          <button type="button" className={btn} onClick={() => onRotate(-90)} aria-label="Girar 90° a la izquierda" title="Girar 90° a la izquierda">
            ⟲
          </button>
          <span className="tabular w-10 text-center text-xs text-foreground-muted" data-testid="rotation">
            {rotationDeg}°
          </span>
          <button type="button" className={btn} onClick={() => onRotate(90)} aria-label="Girar 90° a la derecha" title="Girar 90° a la derecha">
            ⟳
          </button>
        </div>

        {spectrumSwitch}

        <div className="ml-auto flex items-center gap-1">
          {panelToggle && <div className="lg:hidden">{panelToggle}</div>}
          <button type="button" className={cn(btn, "text-xs")} onClick={onDownload} disabled={downloading}>
            {downloading ? "Preparando…" : "Descargar original"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label="Herramienta">
          <ToolButton active={tool === "move"} onClick={() => onTool("move")}>
            Mover
          </ToolButton>
          <ToolButton active={tool === "crosshair"} onClick={() => onTool("crosshair")}>
            Crosshair
          </ToolButton>
          <ToolButton
            active={tool === "area"}
            onClick={() => onTool("area")}
            disabled={!canMeasure}
            title={canMeasure ? "3 clics: 2 puntos para un lado y un 3.º para el lado opuesto" : "Esta foto no tiene escala"}
          >
            Medir área
          </ToolButton>
          <ToolButton
            active={tool === "distance"}
            onClick={() => onTool("distance")}
            disabled={!canMeasure}
            title={canMeasure ? "2 clics: longitudinal, transversal o diagonal según la inclinación" : "Esta foto no tiene escala"}
          >
            Medir distancia
          </ToolButton>
          <ToolButton active={rulerOn} onClick={onToggleRuler} disabled={!rulerAvailable} title={rulerAvailable ? "Mostrar u ocultar la regla" : "Regla no disponible en esta foto o vista"}>
            Regla
          </ToolButton>
        </div>

        {editTools && <div className="hidden items-center gap-1 lg:flex" data-testid="edit-tools">{editTools}</div>}

        <div className="flex flex-wrap items-center gap-3 text-2xs text-foreground-muted">
          <label className="flex items-center gap-1.5">
            Brillo
            <input
              type="range"
              min={30}
              max={250}
              value={filters.brightness}
              onChange={(e) => onFilters({ ...filters, brightness: Number(e.target.value) })}
              className="w-20 accent-current"
              aria-label="Brillo"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Contraste
            <input
              type="range"
              min={30}
              max={250}
              value={filters.contrast}
              onChange={(e) => onFilters({ ...filters, contrast: Number(e.target.value) })}
              className="w-20 accent-current"
              aria-label="Contraste"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filters.negative} onChange={(e) => onFilters({ ...filters, negative: e.target.checked })} />
            Negativo
          </label>
          <button type="button" className="underline hover:text-foreground" onClick={() => onFilters(DEFAULT_FILTERS)}>
            Restablecer
          </button>
        </div>
      </div>
    </div>
  );
}
