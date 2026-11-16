"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useElementSize } from "./useElementSize";

export type StripFace = "TE" | "PS" | "LE" | "SS";

export type StripItem = { face: StripFace; label: string; url: string; width_px: number; height_px: number };

type View = { zoom: number; x: number; y: number };

const MAX_ZOOM_OVER_FIT = 40;
const STEP = 1.25;

const fitView = (box: { w: number; h: number }, img: { w: number; h: number }): View => {
  if (!(box.w > 0 && box.h > 0 && img.w > 0 && img.h > 0)) return { zoom: 1, x: 0, y: 0 };
  const zoom = Math.min(box.w / img.w, box.h / img.h);
  return { zoom, x: (box.w - img.w * zoom) / 2, y: (box.h - img.h * zoom) / 2 };
};

/** Mínimo de la tira (px de pantalla) que sigue a la vista al desplazar o hacer zoom. */
const KEEP_VISIBLE_PX = 64;

/** Limita el desplazamiento para que la tira no salga por completo de la vista. */
export function clampStripView(v: View, box: { w: number; h: number }, img: { w: number; h: number }): View {
  const w = img.w * v.zoom;
  const h = img.h * v.zoom;
  const kx = Math.min(KEEP_VISIBLE_PX, w);
  const ky = Math.min(KEEP_VISIBLE_PX, h);
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  return { zoom: v.zoom, x: clamp(v.x, kx - w, box.w - kx), y: clamp(v.y, ky - h, box.h - ky) };
}

/**
 * Visor aparte de una tira de pala completa: zoom (rueda o botones), desplazamiento (arrastre),
 * ajustar, cerrar (Esc o botón) y flechas para pasar a la cara anterior o siguiente de la misma pala.
 * Solo visual, sin marcas.
 */
export function StripViewer({
  blade,
  items,
  index,
  onIndex,
  onClose,
}: {
  blade: string;
  /** Caras disponibles de la pala, en el orden de la vista lado a lado. */
  items: StripItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index]!;
  const boxRef = useRef<HTMLDivElement>(null);
  const box = useElementSize(boxRef);
  const [natural, setNatural] = useState({ w: item.width_px, h: item.height_px });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Foco: al abrir pasa al botón «Cerrar»; al cerrar vuelve a donde estaba (la tira que se pulsó).
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => before?.focus();
  }, []);

  const fit = fitView(box, natural);
  const v = view ?? fit;
  const prev = index > 0 ? index - 1 : null;
  const next = index < items.length - 1 ? index + 1 : null;

  const zoomAt = (factor: number, at?: { x: number; y: number }) =>
    setView((cur) => {
      const c = cur ?? fit;
      const zoom = Math.min(fit.zoom * MAX_ZOOM_OVER_FIT, Math.max(fit.zoom, c.zoom * factor));
      if (zoom === fit.zoom) return null; // vuelve a «ajustar»
      const k = zoom / c.zoom;
      const p = at ?? { x: box.w / 2, y: box.h / 2 };
      return clampStripView({ zoom, x: p.x - (p.x - c.x) * k, y: p.y - (p.y - c.y) * k }, box, natural);
    });

  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;

  // Rueda no pasiva: el zoom no debe desplazar la página.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(e.deltaY < 0 ? STEP : 1 / STEP, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Teclado: Esc cierra; ← → cambian de cara; + − 0 zoom.
  const keys = useRef({ onClose, prev: () => prev != null && onIndex(prev), next: () => next != null && onIndex(next) });
  keys.current = { onClose, prev: () => prev != null && onIndex(prev), next: () => next != null && onIndex(next) };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.key === "Escape") k.onClose();
      else if (e.key === "ArrowLeft") k.prev();
      else if (e.key === "ArrowRight") k.next();
      else if (e.key === "+" || e.key === "=") zoomRef.current(STEP);
      else if (e.key === "-" || e.key === "_") zoomRef.current(1 / STEP);
      else if (e.key === "0") setView(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  }, []);

  // Al cambiar de cara se vuelve a ajustar.
  useEffect(() => {
    setView(null);
    setNatural({ w: item.width_px, h: item.height_px });
  }, [item.url, item.width_px, item.height_px]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: v.x, y: v.y };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setView((cur) => clampStripView({ zoom: (cur ?? fit).zoom, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, box, natural));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-[2px] border border-white/20 px-2.5 text-sm text-neutral-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

  const content = (
    <div role="dialog" aria-modal="true" aria-label={`Pala ${blade}, ${item.label}`} className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-neutral-100" data-testid="strip-viewer">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-4 py-2">
        <p className="text-sm font-medium" data-testid="strip-viewer-title">
          Pala {blade} · {item.label}
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="Cara">
          <button type="button" className={btn} onClick={() => prev != null && onIndex(prev)} disabled={prev == null} aria-label="Cara anterior" title="Cara anterior (←)">
            ◀
          </button>
          <span className="tabular w-12 text-center text-xs text-neutral-400">
            {index + 1} / {items.length}
          </span>
          <button type="button" className={btn} onClick={() => next != null && onIndex(next)} disabled={next == null} aria-label="Cara siguiente" title="Cara siguiente (→)">
            ▶
          </button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button type="button" className={btn} onClick={() => zoomAt(1 / STEP)} aria-label="Alejar" title="Alejar (−)">
            −
          </button>
          <span className="tabular w-14 text-center text-xs text-neutral-400" data-testid="strip-viewer-zoom">
            {Math.round((v.zoom / (fit.zoom || 1)) * 100)} %
          </span>
          <button type="button" className={btn} onClick={() => zoomAt(STEP)} aria-label="Acercar" title="Acercar (+)">
            +
          </button>
          <button type="button" className={cn(btn, "text-xs")} onClick={() => setView(null)} title="Ajustar (0)">
            Ajustar
          </button>
        </div>
        <button ref={closeRef} type="button" className={cn(btn, "ml-auto text-xs")} onClick={onClose} title="Cerrar (Esc)" data-testid="strip-viewer-close">
          ✕ Cerrar
        </button>
      </div>
      <div
        ref={boxRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {box.w > 0 && (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal del bucket privado
          <img
            key={item.url}
            src={item.url}
            alt={`Pala ${blade}, ${item.label}`}
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              if (w > 0 && h > 0 && (w !== natural.w || h !== natural.h)) setNatural({ w, h });
            }}
            className="absolute left-0 top-0 max-w-none origin-top-left"
            style={{ width: natural.w, height: natural.h, transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})` }}
          />
        )}
      </div>
      <p className="border-t border-white/10 px-4 py-1.5 text-2xs text-neutral-400">
        Punta arriba, raíz abajo · Rueda o + − para el zoom · arrastre para desplazar · ← → cambian de cara · Esc cierra. Vista informativa, sin marcas.
      </p>
    </div>
  );

  return createPortal(content, document.body);
}
