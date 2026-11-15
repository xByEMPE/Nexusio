"use client";

import type { Pt, Region } from "@/lib/blade";
import { SEVERITY_COLOR } from "@/lib/inspections/severity";
import type { ViewerFinding } from "./finding-data";
import { regionOutline } from "./finding-logic";
import type { Size } from "./viewer-logic";

export type ShapeDraft = { type: Region["type"]; points: Pt[]; cursor: Pt | null };

const DRAFT = "#38BDF8";
const pts = (list: Pt[]) => list.map((p) => `${p.x},${p.y}`).join(" ");

/**
 * Daños de la foto (recuadro o polígono, color de severidad; `detected` punteado, `dismissed` tenue),
 * el daño elegido resaltado con sus asas y el borrador de un daño nuevo. Todo en px del original.
 */
export function FindingShapes({
  findings,
  image,
  zoom,
  selectedId,
  override,
  handles,
  draft,
}: {
  findings: ViewerFinding[];
  image: Size;
  zoom: number;
  selectedId: string | null;
  /** Región en edición (asas arrastradas) que reemplaza a la guardada mientras se guarda. */
  override?: { id: string; region: Region } | null;
  /** Asas del daño elegido (px del original); null sin edición. */
  handles?: Pt[] | null;
  draft?: ShapeDraft | null;
}) {
  const r = 6 / zoom;
  return (
    <g data-testid="finding-shapes">
      {findings.map((f) => {
        const region = override?.id === f.id ? override.region : f.region;
        if (!region) return null;
        const color = SEVERITY_COLOR[f.severity] ?? "#A3A3A3";
        const selected = f.id === selectedId;
        const common = {
          fill: selected ? `${color}33` : "none",
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: f.status === "detected" ? "8 5" : undefined,
          opacity: f.status === "dismissed" ? 0.45 : 1,
          vectorEffect: "non-scaling-stroke" as const,
          "data-finding": f.id,
          "data-status": f.status,
          "data-selected": selected ? "true" : undefined,
        };
        return <polygon key={f.id} points={pts(regionOutline(region, image))} {...common} />;
      })}

      {handles?.map((h, i) => (
        <circle key={i} cx={h.x} cy={h.y} r={r} fill="#FFFFFF" stroke="#0A0A0A" strokeWidth={1.5} vectorEffect="non-scaling-stroke" data-testid="handle" />
      ))}

      {draft && <DraftShape draft={draft} r={r} />}
    </g>
  );
}

function DraftShape({ draft, r }: { draft: ShapeDraft; r: number }) {
  const all = draft.cursor ? [...draft.points, draft.cursor] : draft.points;
  let outline: Pt[] = all;
  if (draft.type === "box" && all.length >= 2) {
    const [a, b] = all as [Pt, Pt];
    outline = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  return (
    <g data-testid="finding-draft">
      {outline.length > 1 && (
        <polygon points={pts(outline)} fill="rgba(56,189,248,0.12)" stroke={DRAFT} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      )}
      {draft.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={r * 0.7} fill={DRAFT} stroke="#0C4A6E" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}
