"use client";

import { useCallback, useState } from "react";
import type { Pt, ViewState } from "@/lib/blade";
import { fitTransform, normDeg, panTransform, toViewState, zoomAt, type Size, type Transform } from "./viewer-logic";

type Mode = { kind: "fit"; rotationDeg: number } | { kind: "manual"; t: Transform };

/**
 * Estado de la vista (zoom, desplazamiento, giro) en píxeles del original.
 * Mientras no se toque, la vista sigue ajustada al contenedor (también al cambiar su tamaño).
 */
export function useViewState(image: Size, container: Size) {
  const [mode, setMode] = useState<Mode>({ kind: "fit", rotationDeg: 0 });

  const transform = mode.kind === "fit" ? fitTransform(container, image, mode.rotationDeg) : mode.t;
  const view: ViewState = toViewState(transform, container, image);

  const current = (m: Mode): Transform => (m.kind === "fit" ? fitTransform(container, image, m.rotationDeg) : m.t);

  /** Zoom por un factor; con `at` (px del contenedor) el punto bajo el cursor queda fijo. */
  const zoomBy = (f: number, at?: Pt) => setMode((m) => ({ kind: "manual", t: zoomAt(current(m), container, f, at) }));
  const panBy = (dx: number, dy: number) => setMode((m) => ({ kind: "manual", t: panTransform(current(m), dx, dy) }));
  /** Gira `deg` grados y vuelve a ajustar (con 90° cambian el ancho y el alto visibles). */
  const rotate = (deg: number) => setMode((m) => ({ kind: "fit", rotationDeg: normDeg(current(m).rotationDeg + deg) }));
  /** Ajusta conservando el giro. */
  const fit = () => setMode((m) => ({ kind: "fit", rotationDeg: current(m).rotationDeg }));
  /** Ajusta y quita el giro (al cambiar de foto). */
  const reset = useCallback(() => setMode({ kind: "fit", rotationDeg: 0 }), []);

  return { view, zoomBy, panBy, rotate, fit, reset };
}
