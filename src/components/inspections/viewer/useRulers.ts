"use client";

import { useState } from "react";
import type { Insets } from "@/lib/blade";
import { RULER_H, RULER_W } from "./Ruler";
import { rulerInsets, scaleStatus, type ScaleInfo } from "./viewer-logic";

/**
 * Reglas del visor (izquierda: radio; inferior: mm desde el centro). `on` es el botón «Regla»; cada
 * regla se ve si además la foto y el giro la permiten. Las reglas visibles reservan su franja: la foto
 * se ajusta al resto (`insetsFor`, que usa `useViewState`).
 */
export function useRulers(photo: ScaleInfo) {
  const [on, setOn] = useState(true);
  const insetsFor = (rotationDeg: number): Insets => rulerInsets(scaleStatus(photo, rotationDeg), on, RULER_W, RULER_H);
  /** Márgenes y reglas visibles con este giro. */
  const layout = (rotationDeg: number) => {
    const insets = insetsFor(rotationDeg);
    return { insets, left: insets.left > 0, bottom: insets.bottom > 0 };
  };
  return { on, toggle: () => setOn((v) => !v), insetsFor, layout };
}
