"use client";

import { useEffect, useRef } from "react";
import { keyAction, type KeyAction } from "./viewer-logic";

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** Teclado del visor: cada acción devuelve si la usó; solo entonces se consume la tecla. */
export function useViewerKeys(actions: Record<KeyAction, () => boolean>) {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const a = keyAction(e.key);
      if (a && ref.current[a]()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
