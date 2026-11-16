"use client";

import { horizontalRulerTicks, rulerTicks, type BladeFrame, type ViewState } from "@/lib/blade";
import { groupInt } from "./viewer-logic";

export const RULER_W = 64;
/** Alto de la regla inferior. */
export const RULER_H = 30;

/**
 * Regla virtual: fuera de la capa transformada (tamaño fijo en pantalla), en mm desde la raíz.
 * Quien la usa decide si se dibuja (`scaleStatus().ruler`); con giro `rulerTicks` no da marcas.
 */
export function Ruler({ view, frame, estimated, bottom = 0 }: { view: ViewState; frame: BladeFrame; estimated: boolean; bottom?: number }) {
  const ticks = rulerTicks(view, frame);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden border-r border-yellow-300/40 bg-black/55"
      style={{ width: RULER_W, bottom }}
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

/**
 * Regla inferior: fuera de la capa transformada, en mm desde la columna central de la foto (0) y
 * positiva hacia los dos lados. Empieza a la derecha de la regla izquierda (`left`) si esta se ve.
 */
export function BottomRuler({ view, gsd, estimated, left = 0 }: { view: ViewState; gsd: number; estimated: boolean; left?: number }) {
  const ticks = horizontalRulerTicks(view, gsd);
  return (
    <div
      className="pointer-events-none absolute bottom-0 right-0 z-10 overflow-hidden border-t border-yellow-300/40 bg-black/55"
      style={{ height: RULER_H, left }}
      aria-label="Regla en milímetros desde el centro de la foto"
      data-testid="bottom-ruler"
    >
      <svg width={view.containerW} height={RULER_H} className="block overflow-visible" style={{ marginLeft: -left }}>
        {ticks.map((t) => (
          <g key={t.offset_mm} transform={`translate(${t.x}, 0)`} data-testid="bottom-ruler-tick" data-offset={t.offset_mm}>
            <line x1={0} x2={0} y1={0} y2={t.offset_mm === 0 ? 14 : 10} stroke="#FDE047" strokeWidth={t.offset_mm === 0 ? 2 : 1.5} />
            <text x={0} y={23} textAnchor="middle" fill="#FDE047" fontSize={10} fontFamily="ui-monospace, monospace">
              {groupInt(Number(t.label))}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute bottom-0.5 left-1 bg-black/60 px-0.5 font-mono text-[9px] uppercase text-yellow-200">mm</div>
      {estimated && (
        <div className="absolute bottom-0.5 right-1 bg-black/60 px-0.5 text-[9px] leading-tight text-yellow-200" data-testid="bottom-ruler-estimated">
          escala estimada
        </div>
      )}
    </div>
  );
}
