"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";

export type OverviewStrip = {
  blade: "A" | "B" | "C";
  face: "TE" | "PS" | "LE" | "SS";
  url: string;
  width_px: number;
  height_px: number;
};

const BLADES = ["A", "B", "C"] as const;
const FACE_ORDER = ["LE", "PS", "TE", "SS"] as const;
const FACE_LABEL = { LE: "Borde de ataque (LE)", PS: "Lado de presión (PS)", TE: "Borde de salida (TE)", SS: "Lado de succión (SS)" } as const;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Las 4 caras de una pala lado a lado con un solo zoom y desplazamiento compartidos. Solo visual. */
export function BladeOverview({ strips }: { strips: OverviewStrip[] }) {
  const available = BLADES.filter((b) => strips.some((s) => s.blade === b));
  const [blade, setBlade] = useState<(typeof BLADES)[number]>(available[0] ?? "A");
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const size = () => {
    const box = boxRef.current?.getBoundingClientRect();
    return { w: box?.width ?? 0, h: box?.height ?? 0 };
  };

  const zoomTo = (next: (current: number) => number) =>
    setView((v) => {
      const zoom = clamp(next(v.zoom), MIN_ZOOM, MAX_ZOOM);
      const { w, h } = size();
      const k = zoom / v.zoom;
      // Se conserva el centro de la vista al cambiar de zoom.
      const x = zoom === 1 ? 0 : clamp((v.x - w / 2) * k + w / 2, w * (1 - zoom), 0);
      const y = zoom === 1 ? 0 : clamp((v.y - h / 2) * k + h / 2, h * (1 - zoom), 0);
      return { zoom, x, y };
    });

  const gridRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  // Rueda no pasiva: el zoom no debe desplazar la página.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current((z) => z * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [available.length]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const { w, h } = size();
    setView((v) => ({
      ...v,
      x: clamp(d.x + e.clientX - d.px, w * (1 - v.zoom), 0),
      y: clamp(d.y + e.clientY - d.py, h * (1 - v.zoom), 0),
    }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  if (available.length === 0) {
    return <div className="panel p-10 text-center text-sm text-foreground-muted">Esta inspección aún no tiene tiras de pala completa.</div>;
  }

  const btn = "rounded-[2px] border border-border-subtle px-3 py-1 text-sm hover:bg-background-elevated";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Pala" className="flex gap-1">
          {available.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={b === blade}
              onClick={() => {
                setBlade(b);
                setView({ zoom: 1, x: 0, y: 0 });
              }}
              className={cn(
                "rounded-[2px] border px-3 py-1 text-sm",
                b === blade ? "border-foreground bg-background-elevated font-medium" : "border-border-subtle text-foreground-muted hover:text-foreground",
              )}
            >
              Pala {b}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button type="button" aria-label="Alejar" onClick={() => zoomTo((z) => z / 1.5)} className={btn}>
            −
          </button>
          <span className="tabular w-14 text-center text-xs text-foreground-muted">{Math.round(view.zoom * 100)} %</span>
          <button type="button" aria-label="Acercar" onClick={() => zoomTo((z) => z * 1.5)} className={btn}>
            +
          </button>
          <button type="button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} className={cn(btn, "ml-1 text-xs")}>
            Restablecer
          </button>
        </div>
      </div>

      <div ref={gridRef} className="grid grid-cols-4 gap-2">
        {FACE_ORDER.map((face) => {
          const strip = strips.find((s) => s.blade === blade && s.face === face);
          return (
            <div key={face} className="flex min-w-0 flex-col gap-1">
              <h3 className="label-caps truncate" title={FACE_LABEL[face]}>
                {face}
              </h3>
              <div
                ref={face === "LE" ? boxRef : undefined}
                className="relative h-[70vh] min-h-[360px] touch-none select-none overflow-hidden rounded-[2px] border border-border-subtle bg-background-base"
                style={{ cursor: view.zoom > 1 ? "grab" : "default" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {strip ? (
                  <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal del bucket privado */}
                    <img src={strip.url} alt={`Pala ${blade}, ${FACE_LABEL[face]}`} draggable={false} className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-xs text-foreground-subtle">Sin reconstrucción</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-2xs text-foreground-subtle">Punta arriba, raíz abajo. Rueda o botones para el zoom; arrastre para desplazar. Vista informativa, sin marcas.</p>
    </div>
  );
}
