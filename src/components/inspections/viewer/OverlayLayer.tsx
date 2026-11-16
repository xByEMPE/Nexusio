"use client";

import type { ReactNode, SyntheticEvent } from "react";
import { imageToScreen, rectangleFrom3Points, type Pt, type ViewState } from "@/lib/blade";
import type { MeasureDraft } from "./useAreaTool";
import { groupInt, type AreaMeasurement } from "./viewer-logic";

/** Transformación SVG equivalente a la CSS de la imagen: dentro del grupo se dibuja en px del original. */
export function imageGroupTransform(v: ViewState): string {
  return `translate(${v.containerW / 2 + v.panX} ${v.containerH / 2 + v.panY}) rotate(${v.rotationDeg}) scale(${v.zoom}) translate(${-v.imageW / 2} ${-v.imageH / 2})`;
}

const LABEL_BG = "rgba(0,0,0,0.72)";

const MEASURE_STROKE = "#38BDF8";
const LABEL_W = 196;
const LABEL_LINE = 15;

// El botón ✕ no debe iniciar gestos del escenario (ni añadir puntos).
const stop = (e: SyntheticEvent) => e.stopPropagation();

const ptsAttr = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

/** Etiqueta de una medición, en px de pantalla, encima de la esquina más alta del rectángulo. */
function labelOf(m: AreaMeasurement, view: ViewState): { at: Pt; lines: string[] } {
  const s = m.corners.map((p) => imageToScreen(p, view));
  const at = { x: s.reduce((a, p) => a + p.x, 0) / s.length, y: Math.min(...s.map((p) => p.y)) - 8 };
  const r = m.readout;
  const lines = r
    ? [`Longitudinal ${groupInt(r.longitudinal_mm)} mm`, `Transversal ${groupInt(r.transversal_mm)} mm`, `Área ${groupInt(r.area_mm2)} mm²`]
    : ["Sin escala"];
  return { at, lines };
}

/**
 * Capa SVG sobre la foto. Las formas van en coordenadas de imagen (grupo transformado, trazo que no
 * escala); los textos van en coordenadas de pantalla para que no giren ni cambien de tamaño.
 */
export function OverlayLayer({
  view,
  crosshair,
  measureDraft = null,
  measurements = [],
  onRemoveMeasurement,
  shapes,
}: {
  view: ViewState;
  /** Formas de daños, dibujadas en px del original (dentro del grupo transformado). */
  shapes?: ReactNode;
  /** Cursor en px del contenedor y texto (radio o coordenadas). */
  crosshair: { screen: Pt; text: string } | null;
  /** Medición de área en curso (1 o 2 puntos y el cursor). */
  measureDraft?: MeasureDraft | null;
  /** Mediciones de área terminadas (temporales). */
  measurements?: AreaMeasurement[];
  onRemoveMeasurement?: (id: number) => void;
}) {
  const vertexR = 4 / view.zoom;
  const dPts = measureDraft?.points ?? [];
  const cur = measureDraft?.cursor ?? null;
  let preview: Pt[] | null = null;
  if (dPts.length === 1 && cur) preview = [dPts[0]!, cur];
  else if (dPts.length === 2 && cur) preview = rectangleFrom3Points(dPts[0]!, dPts[1]!, cur);
  const removable = onRemoveMeasurement != null;
  const labels = measurements.map((m) => ({ id: m.id, ...labelOf(m, view) }));

  return (
    <>
    <svg className="pointer-events-none absolute inset-0 z-[5]" width={view.containerW} height={view.containerH} data-testid="overlay">
      <g transform={imageGroupTransform(view)}>
        {shapes}
        {measurements.map((m) => (
          <polygon
            key={m.id}
            points={ptsAttr(m.corners)}
            fill="rgba(56,189,248,0.18)"
            stroke={MEASURE_STROKE}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            data-testid="area-polygon"
          />
        ))}
        {preview && (
          <polygon
            points={ptsAttr(preview)}
            fill="rgba(56,189,248,0.08)"
            stroke={MEASURE_STROKE}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            data-testid="area-preview"
          />
        )}
        {dPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={vertexR} fill={MEASURE_STROKE} stroke="#0C4A6E" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </g>

      {labels.map((l) => {
        const h = l.lines.length * LABEL_LINE + 6;
        return (
          <g key={l.id} transform={`translate(${l.at.x} ${l.at.y})`} data-testid="area-readout">
            <rect x={-LABEL_W / 2} y={-h} width={LABEL_W} height={h} rx={2} fill={LABEL_BG} />
            {l.lines.map((t, i) => (
              <text key={i} x={-LABEL_W / 2 + 8} y={-h + 15 + i * LABEL_LINE} fill="#E0F2FE" fontSize={12} fontFamily="ui-monospace, monospace">
                {t}
              </text>
            ))}
          </g>
        );
      })}

      {crosshair && (
        <g data-testid="crosshair">
          <line x1={0} x2={view.containerW} y1={crosshair.screen.y} y2={crosshair.screen.y} stroke="#F43F5E" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={crosshair.screen.x} x2={crosshair.screen.x} y1={0} y2={view.containerH} stroke="#F43F5E" strokeWidth={1} strokeDasharray="4 3" />
          <rect x={crosshair.screen.x + 10} y={crosshair.screen.y - 26} width={crosshair.text.length * 7.4 + 12} height={20} rx={2} fill={LABEL_BG} />
          <text x={crosshair.screen.x + 16} y={crosshair.screen.y - 12} fill="#FECDD3" fontSize={12} fontFamily="ui-monospace, monospace" data-testid="crosshair-text">
            {crosshair.text}
          </text>
        </g>
      )}
    </svg>
    {removable && labels.map((l) => {
      const h = l.lines.length * LABEL_LINE + 6;
      return (
        <button
          key={l.id}
          type="button"
          aria-label="Borrar esta medición"
          title="Borrar esta medición"
          onPointerDown={stop}
          onDoubleClick={stop}
          onClick={() => onRemoveMeasurement(l.id)}
          className="absolute z-[6] flex h-5 w-5 items-center justify-center rounded-[2px] text-xs text-sky-100 hover:bg-white/20"
          style={{ left: l.at.x + LABEL_W / 2 - 22, top: l.at.y - h + 2 }}
          data-testid="area-remove"
        >
          ✕
        </button>
      );
    })}
    </>
  );
}
