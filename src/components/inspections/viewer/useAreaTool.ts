"use client";

import { useState } from "react";
import { screenToImage, type Pt, type ViewState } from "@/lib/blade";
import type { AreaDraft } from "./OverlayLayer";
import { addVertex, areaReadout, MIN_AREA_POINTS, type Size } from "./viewer-logic";

const DUP_VERTEX_PX = 4;

/** Herramienta «Medir área»: vértices con clic, línea elástica y cierre con 4 o más puntos. */
export function useAreaTool({ active, view, image, gsd }: { active: boolean; view: ViewState; image: Size; gsd: number | null }) {
  const [area, setArea] = useState<AreaDraft | null>(null);

  const hover = (p: Pt | null) => {
    if (!p || !active) return;
    const c = screenToImage(p, view);
    // Actualización funcional: un movimiento justo después de un clic no debe pisar el vértice nuevo.
    setArea((cur) => (cur && !cur.closed ? { ...cur, cursor: c } : cur));
  };

  const tap = (p: Pt) => {
    const img = screenToImage(p, view);
    const minDist = DUP_VERTEX_PX / view.zoom;
    setArea((cur) => (!cur || cur.closed ? { points: [img], closed: false, cursor: img, readout: null } : { ...cur, points: addVertex(cur.points, img, minDist) }));
  };

  /** Cierra el polígono; devuelve un aviso si faltan puntos (null si cerró o no aplica). */
  const close = (): string | null => {
    if (!active || !area || area.closed) return null;
    if (area.points.length < MIN_AREA_POINTS) return `Marca al menos ${MIN_AREA_POINTS} puntos para cerrar.`;
    setArea({ ...area, closed: true, cursor: null, readout: areaReadout(area.points, image, gsd) });
    return null;
  };

  return { area, clear: () => setArea(null), hover, tap, close };
}
