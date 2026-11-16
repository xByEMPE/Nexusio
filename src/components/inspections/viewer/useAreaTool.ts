"use client";

import { useRef, useState } from "react";
import { screenToImage, type Pt, type ViewState } from "@/lib/blade";
import { addDistancePoint, addMeasurePoint, distanceReadout, measureReadout, type AreaMeasurement, type DistanceMeasurement } from "./viewer-logic";

const DUP_VERTEX_PX = 4;

/** Herramienta de medición activa: «Medir área» (3 clics) o «Medir distancia» (2 clics). */
export type MeasureMode = "area" | "distance";

/** Medición en curso: puntos fijos y el cursor (px del original) para la vista previa. */
export type MeasureDraft = { mode: MeasureMode; points: Pt[]; cursor: Pt | null };

/**
 * Herramientas de medición temporales del visor:
 * - «Medir área»: 3 clics forman un rectángulo (p1–p2 un lado; el 3.º fija el lado opuesto).
 * - «Medir distancia»: 2 clics forman un segmento (longitudinal, transversal o diagonal).
 * Las mediciones se acumulan en pantalla, no se guardan y se borran al cambiar de foto.
 */
export function useAreaTool({ mode, view, gsd }: { mode: MeasureMode | null; view: ViewState; gsd: number | null }) {
  const [draft, setDraft] = useState<MeasureDraft | null>(null);
  const [measurements, setMeasurements] = useState<AreaMeasurement[]>([]);
  const [distances, setDistances] = useState<DistanceMeasurement[]>([]);
  const nextId = useRef(1);

  const hover = (p: Pt | null) => {
    if (!p || !mode) return;
    const c = screenToImage(p, view);
    // Actualización funcional: un movimiento justo después de un clic no debe pisar el punto nuevo.
    setDraft((cur) => (cur ? { ...cur, cursor: c } : cur));
  };

  const tap = (p: Pt) => {
    if (!mode) return;
    const img = screenToImage(p, view);
    const points = draft?.mode === mode ? draft.points : [];
    const minDist = DUP_VERTEX_PX / view.zoom;
    if (mode === "area") {
      const step = addMeasurePoint(points, img, minDist);
      if (step.corners) {
        const corners = step.corners;
        setMeasurements((ms) => [...ms, { id: nextId.current++, corners, readout: measureReadout(corners, gsd) }]);
        return setDraft(null);
      }
      return setDraft({ mode, points: step.points, cursor: img });
    }
    const step = addDistancePoint(points, img, minDist);
    if (step.segment) {
      const [a, b] = step.segment;
      setDistances((ds) => [...ds, { id: nextId.current++, a, b, readout: distanceReadout(a, b, gsd) }]);
      return setDraft(null);
    }
    setDraft({ mode, points: step.points, cursor: img });
  };

  return {
    /** Borrador de la herramienta activa (el de otra herramienta no se muestra). */
    draft: draft && draft.mode === mode ? draft : null,
    measurements,
    distances,
    /** Mediciones en pantalla (áreas y distancias). */
    count: measurements.length + distances.length,
    hover,
    tap,
    /** Descarta la medición en curso (las terminadas siguen). */
    cancelDraft: () => setDraft(null),
    remove: (id: number) => {
      setMeasurements((ms) => ms.filter((m) => m.id !== id));
      setDistances((ds) => ds.filter((d) => d.id !== id));
    },
    /** Borra todas las mediciones (áreas y distancias) y la que está en curso. */
    clear: () => {
      setDraft(null);
      setMeasurements([]);
      setDistances([]);
    },
  };
}
