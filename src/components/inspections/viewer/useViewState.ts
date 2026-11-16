"use client";

import { useCallback, useState } from "react";
import { NO_INSETS, type Insets, type Pt, type ViewState } from "@/lib/blade";
import { constrainTransform, fitTransform, normDeg, panTransform, toViewState, zoomAt, type Size, type Transform } from "./viewer-logic";

type Mode = { kind: "fit"; rotationDeg: number } | { kind: "manual"; t: Transform };

const noInsets = (): Insets => NO_INSETS;

/**
 * Estado de la vista (zoom, desplazamiento, giro) en píxeles del original.
 * Vista fija: ajustada, la foto llena el alto (o el ancho) libre de reglas, pegada a la izquierda y sin
 * desplazamiento; con zoom se desplaza sin dejar huecos (`constrainTransform`). Mientras no se toque,
 * la vista sigue ajustada al contenedor (también al cambiar su tamaño). `insetsFor(giro)` da los
 * márgenes que ocupan las reglas con ese giro.
 */
export function useViewState(image: Size, container: Size, insetsFor: (rotationDeg: number) => Insets = noInsets) {
  const [mode, setMode] = useState<Mode>({ kind: "fit", rotationDeg: 0 });

  const current = (m: Mode): Transform => {
    if (m.kind === "fit") return fitTransform(container, image, m.rotationDeg, insetsFor(m.rotationDeg));
    return constrainTransform(m.t, container, image, insetsFor(m.t.rotationDeg));
  };
  const view: ViewState = toViewState(current(mode), container, image);

  /** Zoom por un factor; con `at` (px del contenedor) el punto bajo el cursor queda fijo (y luego se limita). */
  const zoomBy = (f: number, at?: Pt) => setMode((m) => ({ kind: "manual", t: current({ kind: "manual", t: zoomAt(current(m), container, f, at) }) }));
  const panBy = (dx: number, dy: number) => setMode((m) => ({ kind: "manual", t: current({ kind: "manual", t: panTransform(current(m), dx, dy) }) }));
  /** Gira `deg` grados y vuelve a ajustar (con 90° cambian el ancho y el alto visibles). */
  const rotate = (deg: number) => setMode((m) => ({ kind: "fit", rotationDeg: normDeg(current(m).rotationDeg + deg) }));
  /** Ajusta conservando el giro. */
  const fit = () => setMode((m) => ({ kind: "fit", rotationDeg: current(m).rotationDeg }));
  /** Ajusta y quita el giro (al cambiar de foto). */
  const reset = useCallback(() => setMode({ kind: "fit", rotationDeg: 0 }), []);

  return { view, zoomBy, panBy, rotate, fit, reset };
}
