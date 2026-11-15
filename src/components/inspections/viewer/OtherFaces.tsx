"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { ViewerFinding } from "./finding-data";
import { closestByFace, fmtRadius } from "./finding-logic";
import { FindingShapes } from "./FindingShapes";
import { ImageStage, DEFAULT_FILTERS } from "./ImageStage";
import { OverlayLayer } from "./OverlayLayer";
import type { ViewerPhoto } from "./photo-data";
import { useElementSize } from "./useElementSize";
import { useOriginalImage } from "./useOriginalImage";
import { useStageGestures } from "./useStageGestures";
import { useViewState } from "./useViewState";

/** Otras caras: por cada una, la foto de radio más cercano a la actual (miniatura); clic = vista doble. */
export function OtherFaces({
  photos,
  current,
  splitId,
  onPick,
}: {
  photos: ViewerPhoto[];
  current: ViewerPhoto;
  splitId: string | null;
  onPick: (photo: ViewerPhoto) => void;
}) {
  const others = closestByFace(photos, current);
  return (
    <section className="flex flex-col gap-2" data-testid="other-faces">
      <p className="label-caps">Otras caras</p>
      {others.length === 0 ? (
        <p className="text-xs text-foreground-muted">{current.radius_center_m == null ? "Esta foto no tiene radio." : "No hay fotos de otras caras."}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {others.map(({ face, photo }) => (
            <button
              key={face}
              type="button"
              onClick={() => onPick(photo)}
              title={`${face} · ${photo.file_name} · ${fmtRadius(photo.radius_center_m)}`}
              className={cn("flex flex-col overflow-hidden rounded-[2px] border text-left", splitId === photo.id ? "border-sky-400" : "border-border-subtle hover:border-foreground")}
              data-testid="other-face"
              data-face={face}
            >
              {photo.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal del bucket privado
                <img src={photo.thumbUrl} alt={`Cara ${face}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              ) : (
                <div className="aspect-[4/3] w-full bg-background-elevated" />
              )}
              <span className="px-1 py-0.5 text-2xs">
                {face} · {fmtRadius(photo.radius_center_m)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Segunda foto de la vista doble: zoom y desplazamiento propios, con sus daños (solo lectura). */
export function SplitStage({
  photo,
  findings,
  onClose,
  onOpen,
}: {
  photo: ViewerPhoto;
  findings: ViewerFinding[];
  onClose: () => void;
  /** Pasar esta foto a la vista principal. */
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const container = useElementSize(ref);
  const image = { w: photo.width_px, h: photo.height_px };
  const { view, zoomBy, panBy } = useViewState(image, container);
  const [, setMessage] = useState<string | null>(null);
  const original = useOriginalImage(photo, view.zoom, setMessage);
  const gestures = useStageGestures(ref, { zoomBy, panBy, onTap: () => {}, onHover: () => {} });
  const measured = container.w > 0 && container.h > 0;

  return (
    <div className="relative min-h-0 min-w-0 flex-1 border-l border-border-subtle" data-testid="split-stage">
      <div ref={ref} className="absolute inset-0 touch-none select-none overflow-hidden bg-neutral-950" style={{ cursor: "grab" }} {...gestures}>
        {measured && (
          <>
            <ImageStage
              key={photo.id}
              view={view}
              previewUrl={photo.previewUrl}
              originalUrl={original.originalUrl}
              alt={`${photo.file_name}${photo.face ? ` · ${photo.face}` : ""}`}
              filters={DEFAULT_FILTERS}
              onPreviewSize={original.onPreviewSize}
              onOriginalError={original.onOriginalError}
            />
            <OverlayLayer view={view} crosshair={null} area={null} shapes={<FindingShapes findings={findings} image={image} zoom={view.zoom} selectedId={null} />} />
          </>
        )}
      </div>
      <div className="absolute left-2 top-2 z-20 flex items-center gap-1 text-2xs">
        <span className="rounded-[2px] bg-black/70 px-2 py-1 text-neutral-100">
          {photo.face} · {fmtRadius(photo.radius_center_m)}
        </span>
        <button type="button" className="rounded-[2px] bg-black/70 px-2 py-1 text-neutral-100 hover:bg-black" onClick={onOpen}>
          Abrir
        </button>
        <button type="button" className="rounded-[2px] bg-black/70 px-2 py-1 text-neutral-100 hover:bg-black" onClick={onClose} aria-label="Cerrar la vista doble">
          ✕
        </button>
      </div>
    </div>
  );
}
