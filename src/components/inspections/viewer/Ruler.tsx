"use client";

import { rulerTicks, type BladeFrame, type ViewState } from "@/lib/blade";
import { groupInt } from "./viewer-logic";

export const RULER_W = 64;

/**
 * Regla virtual: fuera de la capa transformada (tamaño fijo en pantalla), en mm desde la raíz.
 * Quien la usa decide si se dibuja (`scaleStatus().ruler`); con giro `rulerTicks` no da marcas.
 */
export function Ruler({ view, frame, estimated }: { view: ViewState; frame: BladeFrame; estimated: boolean }) {
  const ticks = rulerTicks(view, frame);
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-10 border-r border-yellow-300/40 bg-black/55"
      style={{ width: RULER_W }}
      aria-label="Regla en milímetros desde la raíz"
      data-testid="ruler"
    >
      <svg width={RULER_W} height={view.containerH} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t.r_m} transform={`translate(0, ${t.y})`}>
            <line x1={RULER_W - 14} x2={RULER_W} y1={0} y2={0} stroke="#FDE047" strokeWidth={1.5} />
            <text x={RULER_W - 17} y={0} dy="0.32em" textAnchor="end" fill="#FDE047" fontSize={10} fontFamily="ui-monospace, monospace">
              {groupInt(Number(t.label))}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute inset-x-0 top-1 text-center font-mono text-[9px] uppercase text-yellow-200">mm</div>
      {estimated && (
        <div className="absolute inset-x-0 bottom-1 px-1 text-center text-[9px] leading-tight text-yellow-200" data-testid="ruler-estimated">
          escala estimada
        </div>
      )}
    </div>
  );
}
