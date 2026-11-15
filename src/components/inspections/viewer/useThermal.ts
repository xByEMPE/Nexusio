"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  decodeThermal,
  statsInBox,
  statsOnLine,
  type PaletteName,
  type Pt,
  type Stats,
  type ThermalMatrix,
} from "@/lib/blade";
import { getThermalUrl } from "@/lib/inspections/viewer-actions";
import type { ViewerPhoto } from "./photo-data";
import { defaultRange, tempAt, toMatrixPt } from "./thermal-logic";

export type ThermalTool = "off" | "box" | "line";
export type ThermalShape = { kind: "box" | "line"; a: Pt; b: Pt };

const MIN_SPAN = 0.5;

async function loadMatrix(photo: ViewerPhoto): Promise<ThermalMatrix> {
  const r = await getThermalUrl(photo.id);
  if (!r.ok) throw new Error(r.message);
  const res = await fetch(r.url);
  if (!res.ok) throw new Error("No se pudo descargar la matriz térmica.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  return decodeThermal(
    bytes,
    photo.thermal!.temp_scale,
    photo.thermal!.temp_offset,
  );
}

/**
 * Modo térmico: matriz decodificada por captura (en memoria), paleta, rango de color y las
 * herramientas de recuadro y línea (dos clics). Solo actúa si la foto actual es térmica.
 */
export function useThermal(photo: ViewerPhoto) {
  const id = photo.id;
  const active = photo.spectrum === "thermal" && photo.thermal != null;
  const [matrices, setMatrices] = useState<Record<string, ThermalMatrix>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const [palette, setPalette] = useState<PaletteName>("hierro");
  const [ranges, setRanges] = useState<
    Record<string, { min: number; max: number }>
  >({});
  const [tool, setTool] = useState<ThermalTool>("off");
  const [first, setFirst] = useState<Pt | null>(null);
  const [hoverPt, setHoverPt] = useState<Pt | null>(null);
  const [result, setResult] = useState<{
    shape: ThermalShape;
    stats: Stats;
  } | null>(null);

  const matrix = matrices[id] ?? null;
  const error = errors[id] ?? null;

  useEffect(() => {
    if (!active || matrices[id] || errors[id] || inFlight.current.has(id))
      return;
    inFlight.current.add(id);
    loadMatrix(photo)
      .then((m) => setMatrices((s) => ({ ...s, [id]: m })))
      .catch((e: unknown) =>
        setErrors((s) => ({
          ...s,
          [id]:
            e instanceof Error
              ? e.message
              : "No se pudo cargar la matriz térmica.",
        })),
      )
      .finally(() => inFlight.current.delete(id));
  }, [active, id, photo, matrices, errors]);

  const bounds = useMemo(() => {
    if (!matrix) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of matrix.data) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { lo: Math.floor(lo), hi: Math.ceil(hi) };
  }, [matrix]);

  const range =
    ranges[id] ?? (matrix ? defaultRange(photo.thermal, matrix) : null);
  const setMin = (v: number) =>
    range &&
    setRanges((s) => ({
      ...s,
      [id]: { min: Math.min(v, range.max - MIN_SPAN), max: range.max },
    }));
  const setMax = (v: number) =>
    range &&
    setRanges((s) => ({
      ...s,
      [id]: { min: range.min, max: Math.max(v, range.min + MIN_SPAN) },
    }));
  const resetRange = () =>
    setRanges((s) =>
      Object.fromEntries(Object.entries(s).filter(([k]) => k !== id)),
    );

  const clearShape = () => {
    setFirst(null);
    setHoverPt(null);
    setResult(null);
  };
  const chooseTool = (t: ThermalTool) => {
    setTool(t);
    clearShape();
  };

  /** Dos clics: primera esquina o extremo, y segunda que mide. Devuelve true si consumió el clic. */
  const tap = (img: Pt): boolean => {
    if (!active || tool === "off" || !matrix) return false;
    if (!first) {
      setResult(null);
      setFirst(img);
      setHoverPt(img);
      return true;
    }
    const image = { w: photo.width_px, h: photo.height_px };
    const a = toMatrixPt(first, image, matrix);
    const b = toMatrixPt(img, image, matrix);
    const stats =
      tool === "box"
        ? statsInBox(matrix, { x0: a.x, y0: a.y, x1: b.x, y1: b.y })
        : statsOnLine(matrix, a, b);
    setResult({ shape: { kind: tool, a: first, b: img }, stats });
    setFirst(null);
    return true;
  };

  const hover = (img: Pt | null) => {
    if (first) setHoverPt(img);
  };

  const temperatureAt = (img: Pt | null): number | null => {
    if (!active || !matrix || !img) return null;
    return tempAt(
      matrix,
      toMatrixPt(img, { w: photo.width_px, h: photo.height_px }, matrix),
    );
  };

  const shape: ThermalShape | null =
    first && hoverPt && tool !== "off"
      ? { kind: tool, a: first, b: hoverPt }
      : (result?.shape ?? null);

  return {
    active,
    matrix,
    error,
    palette,
    setPalette,
    range,
    bounds,
    setMin,
    setMax,
    resetRange,
    tool,
    chooseTool,
    tap,
    hover,
    clear: () => {
      setTool("off");
      clearShape();
    },
    temperatureAt,
    shape,
    stats: result?.stats ?? null,
  };
}
