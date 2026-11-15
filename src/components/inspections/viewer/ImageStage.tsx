"use client";

import { useState } from "react";
import type { ViewState } from "@/lib/blade";

export type ImageFilters = { brightness: number; contrast: number; negative: boolean };

export const DEFAULT_FILTERS: ImageFilters = { brightness: 100, contrast: 100, negative: false };

/** `filter` de CSS para brillo, contraste y negativo (solo la imagen; la regla y las medidas no cambian). */
export function cssFilter(f: ImageFilters): string {
  return `brightness(${f.brightness}%) contrast(${f.contrast}%)${f.negative ? " invert(1)" : ""}`;
}

/**
 * Foto dentro de la capa transformada: `translate(pan) scale(zoom) rotate(θ)` con origen en el centro,
 * dibujada al tamaño del original (las coordenadas son px del original). Encima de la vista previa
 * se superpone el original cuando llega y termina de cargar, sin parpadeo.
 */
export function ImageStage({
  view,
  previewUrl,
  originalUrl,
  alt,
  filters,
  onPreviewSize,
  onOriginalError,
}: {
  view: ViewState;
  previewUrl: string | null;
  originalUrl: string | null;
  alt: string;
  filters: ImageFilters;
  /** Ancho natural de la vista previa, para decidir cuándo pedir el original. */
  onPreviewSize: (naturalW: number) => void;
  onOriginalError: () => void;
}) {
  const [loadedOriginal, setLoadedOriginal] = useState<string | null>(null);
  const showOriginal = originalUrl != null && loadedOriginal === originalUrl;

  const style = {
    width: view.imageW,
    height: view.imageH,
    left: view.containerW / 2 - view.imageW / 2,
    top: view.containerH / 2 - view.imageH / 2,
    transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom}) rotate(${view.rotationDeg}deg)`,
    transformOrigin: "50% 50%",
    filter: cssFilter(filters),
  } as const;

  return (
    <div className="pointer-events-none absolute max-w-none select-none" style={style}>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal del bucket privado
        <img
          src={previewUrl}
          alt={alt}
          draggable={false}
          className="absolute inset-0 h-full w-full max-w-none"
          ref={(el) => {
            // Si ya estaba en caché, `load` pudo dispararse antes de enlazar el evento.
            if (el?.complete && el.naturalWidth > 0) onPreviewSize(el.naturalWidth);
          }}
          onLoad={(e) => onPreviewSize(e.currentTarget.naturalWidth)}
        />
      ) : (
        <div className="absolute inset-0 bg-background-elevated" />
      )}
      {originalUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal del bucket privado
        <img
          src={originalUrl}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full max-w-none"
          style={{ opacity: showOriginal ? 1 : 0 }}
          onLoad={() => setLoadedOriginal(originalUrl)}
          onError={onOriginalError}
          data-original={showOriginal ? "loaded" : "loading"}
        />
      )}
    </div>
  );
}
