"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Size } from "./viewer-logic";

/** Tamaño (px) de un elemento, con medida inicial inmediata y luego por `ResizeObserver`. */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // El primer aviso del ResizeObserver llega con el siguiente cuadro pintado (y no llega en un panel oculto).
    const box = el.getBoundingClientRect();
    setSize({ w: Math.round(box.width), h: Math.round(box.height) });
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** true en pantallas `lg` o mayores (las herramientas de edición solo existen ahí). */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setDesktop(mq.matches);
    const on = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}
