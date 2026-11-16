"use client";

import { useRef, useState } from "react";
import { screenToImage, type Pt, type ViewState } from "@/lib/blade";
import { addMeasurePoint, measureReadout, type AreaMeasurement } from "./viewer-logic";

const DUP_VERTEX_PX = 4;

/** Medición en curso: 1 o 2 puntos fijos y el cursor (px del original) para la vista previa. */
export type MeasureDraft = { points: Pt[]; cursor: Pt | null };

/**
 * Herramienta «Medir área»: 3 clics forman un rectángulo (p1–p2 un lado; el 3.º fija el lado opuesto).
 * Las mediciones se acumulan en pantalla, son temporales y se borran al cambiar de foto.
 */
export function useAreaTool({ active, view, gsd }: { active: boolean; view: ViewState; gsd: number | null }) {
  const [draft, setDraft] = useState<MeasureDraft | null>(null);
  const [measurements, setMeasurements] = useState<AreaMeasurement[]>([]);
  const nextId = useRef(1);

  const hover = (p: Pt | null) => {
    if (!p || !active) return;
    const c = screenToImage(p, view);
    // Actualización funcional: un movimiento justo después de un clic no debe pisar el punto nuevo.
    setDraft((cur) => (cur ? { ...cur, cursor: c } : cur));
  };

  const tap = (p: Pt) => {
    const img = screenToImage(p, view);
    const step = addMeasurePoint(draft?.points ?? [], img, DUP_VERTEX_PX / view.zoom);
    if (step.corners) {
      const corners = step.corners;
      setMeasurements((ms) => [...ms, { id: nextId.current++, corners, readout: measureReadout(corners, gsd) }]);
      setDraft(null);
    } else {
      setDraft({ points: step.points, cursor: img });
    }
  };

  return {
    draft,
    measurements,
    hover,
    tap,
    /** Descarta la medición en curso (las terminadas siguen). */
    cancelDraft: () => setDraft(null),
    remove: (id: number) => setMeasurements((ms) => ms.filter((m) => m.id !== id)),
    /** Borra todas las mediciones y la que está en curso. */
    clear: () => {
      setDraft(null);
      setMeasurements([]);
    },
  };
}
