"use client";

import { SEVERITY_COLOR } from "@/lib/inspections/severity";
import type { ViewerFinding } from "./finding-data";
import { bladeY, FACES, fmtRadius, modelLength } from "./finding-logic";

const W = 100;
const H = 640;
const Y_TIP = 28;
const Y_ROOT = H - 20;
const LANE_X: Record<string, number> = { LE: 26, PS: 42, TE: 58, SS: 74 };

type ModelCapture = { id: string; face: string | null; radius_center_m: number | null };

/**
 * Modelo 2D vertical de la pala (punta arriba, raíz abajo): cada daño en `y(r)` con su color de
 * severidad, en el carril de su cara. Clic en un marcador = abrir la foto del daño.
 */
export function BladeModel2D({
  blade_length_m,
  findings,
  captures,
  currentRadius,
  selectedId,
  onSelect,
}: {
  blade_length_m: number | null;
  /** Daños de la pala actual. */
  findings: ViewerFinding[];
  /** Fotos de la pala actual. */
  captures: ModelCapture[];
  currentRadius: number | null;
  selectedId: string | null;
  onSelect: (f: ViewerFinding) => void;
}) {
  const L = modelLength(blade_length_m, captures.map((c) => c.radius_center_m));
  if (L == null) return <p className="p-2 text-2xs text-foreground-muted">Sin largo de pala</p>;
  const faceOf = new Map(captures.map((c) => [c.id, c.face]));
  const y = (r: number) => bladeY(r, L, Y_ROOT, Y_TIP);
  const placed = findings.filter((f) => f.radius_m != null);
  const ticks = Array.from({ length: Math.floor(L / 10) + 1 }, (_, i) => i * 10);

  // Silueta: raíz cilíndrica, cuerda máxima hacia el 25 % y punta afilada.
  const outline = `M 38 ${Y_ROOT} L 62 ${Y_ROOT} L 64 ${y(L * 0.08)} L 86 ${y(L * 0.25)} L 66 ${y(L * 0.9)} L 52 ${Y_TIP} L 48 ${Y_TIP} L 34 ${y(L * 0.6)} L 16 ${y(L * 0.25)} L 36 ${y(L * 0.08)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" data-testid="blade-model" role="img" aria-label={`Modelo de la pala, ${L.toFixed(1)} m`}>
      <path d={outline} fill="currentColor" fillOpacity={0.06} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
      {FACES.map((f) => (
        <text key={f} x={LANE_X[f]} y={14} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.6}>
          {f}
        </text>
      ))}
      {ticks.map((r) => (
        <g key={r} opacity={0.5}>
          <line x1={0} x2={6} y1={y(r)} y2={y(r)} stroke="currentColor" strokeWidth={0.6} />
          <text x={8} y={y(r) + 2.5} fontSize={6.5} fill="currentColor">
            {r}
          </text>
        </g>
      ))}
      {currentRadius != null && (
        <line x1={10} x2={W - 4} y1={y(currentRadius)} y2={y(currentRadius)} stroke="#38BDF8" strokeWidth={1} strokeDasharray="3 2" data-testid="model-current" />
      )}
      {placed.map((f) => {
        const face = f.capture_id ? faceOf.get(f.capture_id) : null;
        const cx = (face && LANE_X[face]) || W / 2;
        const sel = f.id === selectedId;
        return (
          <circle
            key={f.id}
            cx={cx}
            cy={y(f.radius_m!)}
            r={sel ? 6 : 4.5}
            fill={SEVERITY_COLOR[f.severity] ?? "#A3A3A3"}
            fillOpacity={f.status === "dismissed" ? 0.35 : 1}
            stroke={sel ? "#FFFFFF" : "#0A0A0A"}
            strokeWidth={sel ? 1.5 : 0.8}
            strokeDasharray={f.status === "detected" ? "2 1.5" : undefined}
            className="cursor-pointer"
            onClick={() => onSelect(f)}
            data-testid="model-marker"
            data-finding={f.id}
            data-severity={f.severity}
            data-cy={Math.round(y(f.radius_m!))}
          >
            <title>{`Cat ${f.severity} · ${face ?? "—"} · ${fmtRadius(f.radius_m)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
