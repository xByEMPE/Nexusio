"use client";

import { useEffect, useRef } from "react";
import {
  renderThermal,
  type PaletteName,
  type ThermalMatrix,
  type ViewState,
} from "@/lib/blade";
import type { ThermalShape } from "./useThermal";

/**
 * Matriz térmica pintada en un <canvas> del tamaño de la propia matriz, con la misma transformación
 * que la foto (la capa tiene el tamaño de la captura y el canvas se estira a ella).
 */
export function ThermalCanvas({
  view,
  matrix,
  palette,
  min,
  max,
}: {
  view: ViewState;
  matrix: ThermalMatrix;
  palette: PaletteName;
  min: number;
  max: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const rgba = renderThermal(matrix, palette, min, max);
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), matrix.width, matrix.height),
      0,
      0,
    );
  }, [matrix, palette, min, max]);

  const style = {
    width: view.imageW,
    height: view.imageH,
    left: view.containerW / 2 - view.imageW / 2,
    top: view.containerH / 2 - view.imageH / 2,
    transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom}) rotate(${view.rotationDeg}deg)`,
    transformOrigin: "50% 50%",
  } as const;

  return (
    <div
      className="pointer-events-none absolute max-w-none select-none"
      style={style}
    >
      <canvas
        ref={ref}
        width={matrix.width}
        height={matrix.height}
        className="absolute inset-0 h-full w-full max-w-none"
        style={{ imageRendering: view.zoom > 2 ? "pixelated" : "auto" }}
        data-testid="thermal-canvas"
      />
    </div>
  );
}

/** Recuadro o línea de medición, en px del original (dentro del grupo transformado del overlay). */
export function ThermalShapes({ shape }: { shape: ThermalShape | null }) {
  if (!shape) return null;
  const { a, b } = shape;
  const common = {
    stroke: "#FACC15",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return shape.kind === "box" ? (
    <rect
      x={Math.min(a.x, b.x)}
      y={Math.min(a.y, b.y)}
      width={Math.abs(a.x - b.x)}
      height={Math.abs(a.y - b.y)}
      fill="rgba(250,204,21,0.1)"
      {...common}
      data-testid="thermal-shape"
    />
  ) : (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      {...common}
      data-testid="thermal-shape"
    />
  );
}
