"use client";

import { imageToScreen, type Pt, type ViewState } from "@/lib/blade";
import { groupInt, type AreaReadout } from "./viewer-logic";

export type AreaDraft = {
  /** Vértices en px del original. */
  points: Pt[];
  closed: boolean;
  /** Posición del cursor (px del original) para la línea elástica mientras se dibuja. */
  cursor: Pt | null;
  readout: AreaReadout | null;
};

/** Transformación SVG equivalente a la CSS de la imagen: dentro del grupo se dibuja en px del original. */
export function imageGroupTransform(v: ViewState): string {
  return `translate(${v.containerW / 2 + v.panX} ${v.containerH / 2 + v.panY}) rotate(${v.rotationDeg}) scale(${v.zoom}) translate(${-v.imageW / 2} ${-v.imageH / 2})`;
}

const LABEL_BG = "rgba(0,0,0,0.72)";

/**
 * Capa SVG sobre la foto. Las formas van en coordenadas de imagen (grupo transformado, trazo que no
 * escala); los textos van en coordenadas de pantalla para que no giren ni cambien de tamaño.
 */
export function OverlayLayer({
  view,
  crosshair,
  area,
}: {
  view: ViewState;
  /** Cursor en px del contenedor y texto (radio o coordenadas). */
  crosshair: { screen: Pt; text: string } | null;
  area: AreaDraft | null;
}) {
  const pts = area?.points ?? [];
  const rubber = area && !area.closed && area.cursor ? [...pts, area.cursor] : pts;
  const vertexR = 4 / view.zoom;

  let label: { at: Pt; lines: string[] } | null = null;
  if (area?.closed && area.readout && pts.length > 0) {
    const s = pts.map((p) => imageToScreen(p, view));
    const at = { x: s.reduce((a, p) => a + p.x, 0) / s.length, y: Math.min(...s.map((p) => p.y)) - 8 };
    label = {
      at,
      lines: [
        `Área ${groupInt(area.readout.area_mm2)} mm²`,
        `Ancho ${groupInt(area.readout.width_mm)} mm · Alto ${groupInt(area.readout.height_mm)} mm`,
      ],
    };
  }

  return (
    <svg className="pointer-events-none absolute inset-0 z-[5]" width={view.containerW} height={view.containerH} data-testid="overlay">
      <g transform={imageGroupTransform(view)}>
        {rubber.length > 1 && (
          <polygon
            points={rubber.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={area?.closed ? "rgba(56,189,248,0.18)" : "rgba(56,189,248,0.08)"}
            stroke="#38BDF8"
            strokeWidth={1.5}
            strokeDasharray={area?.closed ? undefined : "6 4"}
            vectorEffect="non-scaling-stroke"
            data-testid="area-polygon"
          />
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={vertexR} fill="#38BDF8" stroke="#0C4A6E" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </g>

      {label && (
        <g transform={`translate(${label.at.x} ${label.at.y})`} data-testid="area-readout">
          <rect x={-130} y={-36} width={260} height={34} rx={2} fill={LABEL_BG} />
          {label.lines.map((l, i) => (
            <text key={i} x={0} y={-22 + i * 15} textAnchor="middle" fill="#E0F2FE" fontSize={12} fontFamily="ui-monospace, monospace">
              {l}
            </text>
          ))}
        </g>
      )}

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
  );
}
