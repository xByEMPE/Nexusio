"use client";

import type { ReactNode, SyntheticEvent } from "react";
import type { Region } from "@/lib/blade";
import type { ViewerFindingType } from "./finding-data";
import { MIN_POLYGON_POINTS } from "./finding-logic";
import { NewFindingForm } from "./FindingEditor";
import { RULER_W } from "./Ruler";
import type { Tool } from "./Toolbar";
import type { ScaleStatus } from "./viewer-logic";

export function Notice({ children, tone, testId }: { children: ReactNode; tone?: "warn"; testId?: string }) {
  return (
    <span className={tone === "warn" ? "rounded-[2px] bg-amber-500/90 px-2 py-1 text-black" : "rounded-[2px] bg-black/70 px-2 py-1 text-neutral-100"} data-testid={testId}>
      {children}
    </span>
  );
}

// Los controles sobre la foto no deben iniciar gestos del escenario (ni añadir vértices).
const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Capa de avisos y controles sobre la foto: avisos de escala, mensajes, ayuda mientras se dibuja
 * (con «Cerrar» para el polígono), «Borrar mediciones» y el formulario del daño nuevo cuando la región está lista.
 */
export function StageHud({
  status,
  rulerShown,
  notice,
  tool,
  drawing,
  points,
  onCloseShape,
  measurementCount,
  onClearMeasurements,
  newFinding,
}: {
  status: ScaleStatus;
  rulerShown: boolean;
  notice: string | null;
  tool: Tool;
  /** Hay un dibujo en curso (área o daño nuevo). */
  drawing: boolean;
  /** Vértices del dibujo en curso. */
  points: number;
  onCloseShape: () => void;
  /** Mediciones de área en pantalla (temporales). */
  measurementCount: number;
  onClearMeasurements: () => void;
  newFinding: { inspectionId: string; captureId: string; region: Region; types: ViewerFindingType[]; onDone: () => void; onCancel: () => void } | null;
}) {
  return (
    <>
      <div className="pointer-events-none absolute right-2 top-2 z-20 flex max-w-[70%] flex-col items-end gap-1 text-2xs">
        {status.noScale && <Notice testId="no-scale">Esta foto no tiene escala</Notice>}
        {!status.noScale && !status.hasRadius && <Notice>Foto sin radio: se mide, pero sin posición en la pala</Notice>}
        {status.hasRadius && !status.ruler && <Notice testId="ruler-hidden">Regla oculta con la foto girada</Notice>}
        {status.estimated && !rulerShown && <Notice>Escala estimada</Notice>}
        {notice && <Notice tone="warn">{notice}</Notice>}
      </div>

      {(drawing || measurementCount > 0) && (
        <div
          className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 text-2xs"
          style={{ marginLeft: rulerShown ? RULER_W / 2 : 0 }}
          onPointerDown={stop}
          onDoubleClick={stop}
        >
          {drawing && (
            <Notice>
              {tool === "area"
                ? "2 clics marcan un lado y el 3.º el lado opuesto · Esc cancela"
                : tool === "newBox"
                  ? "Clic en dos esquinas opuestas · Esc cancela"
                  : "Clic en cada vértice · doble clic o «Cerrar» · Esc cancela"}
            </Notice>
          )}
          {drawing && tool === "newPolygon" && (
            <button
              type="button"
              onClick={onCloseShape}
              disabled={points < MIN_POLYGON_POINTS}
              className="rounded-[2px] bg-sky-500 px-2 py-1 font-medium text-black disabled:opacity-40"
              data-testid="polygon-close"
            >
              Cerrar
            </button>
          )}
          {measurementCount > 0 && (
            <button
              type="button"
              onClick={onClearMeasurements}
              className="whitespace-nowrap rounded-[2px] bg-black/70 px-2 py-1 font-medium text-neutral-100 hover:bg-black/85"
              data-testid="area-clear"
            >
              Borrar mediciones ({measurementCount})
            </button>
          )}
        </div>
      )}

      {newFinding && (
        <div className="absolute left-2 top-2 z-30" style={{ marginLeft: rulerShown ? RULER_W : 0 }} onPointerDown={stop} onDoubleClick={stop}>
          <NewFindingForm {...newFinding} />
        </div>
      )}
    </>
  );
}
