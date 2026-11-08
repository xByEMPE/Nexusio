"use client";

import { useEffect, useState, type RefObject } from "react";

/** true mientras el elemento intersecta el viewport (con margen opcional). */
export function useInViewport<T extends Element>(
  ref: RefObject<T | null>,
  rootMargin = "0px",
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return visible;
}
