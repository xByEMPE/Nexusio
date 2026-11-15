"use client";

import { useMemo, useRef } from "react";
import type { ViewerPhoto } from "./photo-data";

/** Las URL firmadas valen 1 h; se reutilizan las ya cargadas durante 45 min para no recargar las imágenes. */
const REUSE_MS = 45 * 60 * 1000;

/**
 * Tras `router.refresh()` el servidor vuelve a firmar todas las vistas previas (URL nuevas):
 * se conservan las anteriores mientras sigan vigentes, para que la foto no parpadee.
 */
export function useStablePhotos(photos: ViewerPhoto[]): ViewerPhoto[] {
  const seen = useRef(new Map<string, { previewUrl: string | null; thumbUrl: string | null; at: number }>());
  return useMemo(() => {
    const now = Date.now();
    return photos.map((p) => {
      const prev = seen.current.get(p.id);
      if (prev && now - prev.at < REUSE_MS) {
        return { ...p, previewUrl: prev.previewUrl ?? p.previewUrl, thumbUrl: prev.thumbUrl ?? p.thumbUrl };
      }
      seen.current.set(p.id, { previewUrl: p.previewUrl, thumbUrl: p.thumbUrl, at: now });
      return p;
    });
  }, [photos]);
}
