"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Pt } from "@/lib/blade";

const WHEEL_STEP = 1.15;
const DRAG_THRESHOLD_PX = 4;

type Handlers = {
  zoomBy: (f: number, at?: Pt) => void;
  panBy: (dx: number, dy: number) => void;
  /** Clic o toque sin arrastre, en px del contenedor. */
  onTap: (p: Pt) => void;
  /** Movimiento del puntero (con o sin botón), en px del contenedor; null al salir. */
  onHover: (p: Pt | null) => void;
  /**
   * Al apoyar un solo puntero: si devuelve true, el gesto es un arrastre propio (p. ej. un asa)
   * y no desplaza la foto; se siguen `onPressMove` y `onPressEnd` en px del contenedor.
   */
  onPressStart?: (p: Pt) => boolean;
  onPressMove?: (p: Pt) => void;
  onPressEnd?: (p: Pt | null) => void;
};

/**
 * Gestos del escenario: arrastre = desplazar, clic/toque = `onTap`, dos dedos = zoom,
 * rueda (no pasiva, para no desplazar la página) = zoom centrado en el cursor.
 */
export function useStageGestures(stageRef: RefObject<HTMLDivElement | null>, handlers: Handlers) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      h.current.zoomBy(e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [stageRef]);

  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ start: Pt; last: Pt; moved: boolean; pinch: number | null; claimed: boolean } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      const claimed = h.current.onPressStart?.(p) ?? false;
      gesture.current = { start: p, last: p, moved: false, pinch: null, claimed };
    } else if (gesture.current) {
      if (gesture.current.claimed) h.current.onPressEnd?.(null); // un segundo dedo cancela el arrastre propio
      gesture.current.claimed = false;
      gesture.current.moved = true; // dos dedos: nunca es un clic
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = local(e);
    h.current.onHover(p);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.claimed) {
      h.current.onPressMove?.(p);
      return;
    }

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.pinch && d > 0) h.current.zoomBy(d / g.pinch, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      g.pinch = d;
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) > DRAG_THRESHOLD_PX) g.moved = true;
    if (g.moved) h.current.panBy(p.x - g.last.x, p.y - g.last.y);
    g.last = p;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      if (g) g.pinch = null;
      return;
    }
    gesture.current = null;
    if (g?.claimed) {
      h.current.onPressEnd?.(e.type === "pointerup" ? local(e) : null);
      return;
    }
    if (g && !g.moved && e.type === "pointerup") h.current.onTap(local(e));
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onPointerLeave: () => h.current.onHover(null),
  };
}
