"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { screenToImage, type Pt } from "@/lib/blade";
import type { ViewerCapabilities } from "@/lib/inspections/capabilities";
import { ImageStage, DEFAULT_FILTERS, type ImageFilters } from "./ImageStage";
import { OverlayLayer, type AreaDraft } from "./OverlayLayer";
import type { ViewerPhoto } from "./photo-data";
import { Ruler, RULER_W } from "./Ruler";
import { Toolbar, type Tool } from "./Toolbar";
import { useOriginalImage } from "./useOriginalImage";
import { useStageGestures } from "./useStageGestures";
import { useViewState } from "./useViewState";
import {
  addVertex,
  areaReadout,
  cancelApplies,
  crosshairText,
  frameFor,
  keyAction,
  MIN_AREA_POINTS,
  neighbors,
  scaleStatus,
  type KeyAction,
  type Size,
} from "./viewer-logic";

export type PhotoViewerData = {
  photos: ViewerPhoto[];
  initialPhotoId: string;
  /** Orientación de las fotos de VND (punta arriba); viene del servidor (`TIP_AT_TOP`). */
  tipAtTop: boolean;
};

const KEY_STEP = 1.25;
const DUP_VERTEX_PX = 4;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

/** Visor de fotos de palas (contenedor y estado). Lo comparten admin y portal; cada uno pasa sus permisos. */
export function PhotoViewer({
  data,
  mode,
  capabilities,
}: {
  data: PhotoViewerData;
  mode: "staff" | "client";
  capabilities: ViewerCapabilities;
}) {
  const { photos, tipAtTop } = data;
  const [currentId, setCurrentId] = useState(data.initialPhotoId);
  const photo = photos.find((p) => p.id === currentId) ?? photos[0]!;
  const nav = neighbors(photos, photo.id);

  const stageRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // Medida inicial inmediata (el primer aviso del ResizeObserver llega con el siguiente cuadro pintado).
    const box = el.getBoundingClientRect();
    setContainer({ w: Math.round(box.width), h: Math.round(box.height) });
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainer({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const image = { w: photo.width_px, h: photo.height_px };
  const { view, zoomBy, panBy, rotate, fit, reset } = useViewState(image, container);

  const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
  const [tool, setTool] = useState<Tool>("move");
  const [rulerOn, setRulerOn] = useState(true);
  const [area, setArea] = useState<AreaDraft | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const status = frameStatus(photo, view.rotationDeg, tipAtTop);

  // --- Navegación -----------------------------------------------------------------------------
  const goTo = (id: string) => {
    if (id === photo.id) return;
    setCurrentId(id);
    reset();
    setArea(null);
    setMessage(null);
    // Solo cambia la URL (sin volver a pedir la página al servidor ni recargar).
    const url = new URL(window.location.href);
    url.searchParams.set("foto", id);
    url.searchParams.delete("dano");
    window.history.replaceState(window.history.state, "", url);
  };
  const goPrev = nav.prev ? () => goTo(nav.prev!.id) : null;
  const goNext = nav.next ? () => goTo(nav.next!.id) : null;

  // Precarga de las vistas previas de las 2 vecinas.
  useEffect(() => {
    for (const n of [nav.prev, nav.next]) {
      if (n?.previewUrl) new Image().src = n.previewUrl;
    }
  }, [nav.prev, nav.next]);

  // --- Vista previa → original -----------------------------------------------------------------
  const original = useOriginalImage(photo, view.zoom, setMessage);

  const download = async () => {
    setDownloading(true);
    const url = await original.freshOriginalUrl();
    setDownloading(false);
    if (!url) return;
    const a = document.createElement("a");
    a.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(photo.file_name)}`;
    a.rel = "noopener";
    a.click();
  };

  // --- Herramientas ----------------------------------------------------------------------------
  const chooseTool = (t: Tool) => {
    setTool(t);
    if (t !== "area") setArea(null);
    setMessage(null);
  };
  const cancel = () => {
    setArea(null);
    setTool("move");
    setMessage(null);
  };

  const closeArea = () => {
    if (tool !== "area" || !area || area.closed) return;
    if (area.points.length < MIN_AREA_POINTS) {
      setMessage(`Marca al menos ${MIN_AREA_POINTS} puntos para cerrar.`);
      return;
    }
    setMessage(null);
    setArea({ ...area, closed: true, cursor: null, readout: areaReadout(area.points, image, photo.gsd_mm_px) });
  };

  // Teclado: cada acción devuelve si la usó; solo entonces se consume la tecla.
  const actions: Record<KeyAction, () => boolean> = {
    prev: () => (goPrev ? (goPrev(), true) : false),
    next: () => (goNext ? (goNext(), true) : false),
    zoomIn: () => (zoomBy(KEY_STEP), true),
    zoomOut: () => (zoomBy(1 / KEY_STEP), true),
    fit: () => (fit(), true),
    cancel: () => (cancelApplies(tool, area != null) ? (cancel(), true) : false),
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const a = keyAction(e.key);
      if (a && actionsRef.current[a]()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Puntero: arrastre = desplazar; clic = vértice; dos dedos = zoom -------------------------
  const gestures = useStageGestures(stageRef, {
    zoomBy,
    panBy,
    onHover: (p) => {
      setCursor(p);
      if (p && tool === "area" && area && !area.closed) setArea({ ...area, cursor: screenToImage(p, view) });
    },
    onTap: (p) => {
      if (tool !== "area" || !status.canMeasure) return;
      const img = screenToImage(p, view);
      const minDist = DUP_VERTEX_PX / view.zoom;
      setArea((cur) =>
        !cur || cur.closed
          ? { points: [img], closed: false, cursor: img, readout: null }
          : { ...cur, points: addVertex(cur.points, img, minDist) },
      );
    },
  });

  const crosshair =
    tool === "crosshair" && cursor ? { screen: cursor, text: crosshairText(screenToImage(cursor, view), status.frame) } : null;

  const measured = container.w > 0 && container.h > 0;
  const rulerShown = rulerOn && status.ruler && status.frame != null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2px] border border-border-subtle" data-mode={mode}>
      <Toolbar
        fileName={photo.file_name}
        blade={photo.blade}
        face={photo.face}
        position={{ index: nav.index, total: nav.total }}
        onPrev={goPrev}
        onNext={goNext}
        zoom={view.zoom}
        onZoomIn={() => zoomBy(KEY_STEP)}
        onZoomOut={() => zoomBy(1 / KEY_STEP)}
        onFit={fit}
        rotationDeg={view.rotationDeg}
        onRotate={rotate}
        filters={filters}
        onFilters={setFilters}
        tool={tool}
        onTool={chooseTool}
        canMeasure={status.canMeasure}
        rulerOn={rulerOn}
        rulerAvailable={status.ruler}
        onToggleRuler={() => setRulerOn((v) => !v)}
        onDownload={download}
        downloading={downloading}
        // Las herramientas de daños (Tarea 9) se pasan por `editTools` solo con `capabilities.editFindings`.
      />

      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-neutral-950"
        style={{ cursor: tool === "move" ? "grab" : "crosshair" }}
        {...gestures}
        onDoubleClick={closeArea}
        data-testid="stage"
        data-original={original.originalUrl ? "requested" : "preview"}
      >
        {measured && (
          <>
            <ImageStage
              key={photo.id}
              view={view}
              previewUrl={photo.previewUrl}
              originalUrl={original.originalUrl}
              alt={`${photo.file_name}${photo.blade ? ` · pala ${photo.blade}` : ""}${photo.face ? ` · ${photo.face}` : ""}`}
              filters={filters}
              onPreviewSize={original.onPreviewSize}
              onOriginalError={original.onOriginalError}
            />
            <OverlayLayer view={view} crosshair={crosshair} area={area} />
            {rulerShown && <Ruler view={view} frame={status.frame!} estimated={status.estimated} />}
          </>
        )}

        <div className="pointer-events-none absolute right-2 top-2 z-20 flex max-w-[70%] flex-col items-end gap-1 text-2xs">
          {status.noScale && <Notice testId="no-scale">Esta foto no tiene escala</Notice>}
          {!status.noScale && !status.hasRadius && <Notice>Foto sin radio: se mide, pero sin posición en la pala</Notice>}
          {status.hasRadius && !status.ruler && <Notice testId="ruler-hidden">Regla oculta con la foto girada</Notice>}
          {status.estimated && !rulerShown && <Notice>Escala estimada</Notice>}
          {message && <Notice tone="warn">{message}</Notice>}
        </div>
        {tool === "area" && !area?.closed && (
          <div
            className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 text-2xs"
            style={{ marginLeft: rulerShown ? RULER_W / 2 : 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Notice>Clic en cada vértice · doble clic o «Cerrar» · Esc cancela</Notice>
            <button
              type="button"
              onClick={closeArea}
              disabled={(area?.points.length ?? 0) < MIN_AREA_POINTS}
              className="rounded-[2px] bg-sky-500 px-2 py-1 font-medium text-black disabled:opacity-40"
              data-testid="area-close"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Notice({ children, tone, testId }: { children: ReactNode; tone?: "warn"; testId?: string }) {
  return (
    <span
      className={tone === "warn" ? "rounded-[2px] bg-amber-500/90 px-2 py-1 text-black" : "rounded-[2px] bg-black/70 px-2 py-1 text-neutral-100"}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

function frameStatus(photo: ViewerPhoto, rotationDeg: number, tipAtTop: boolean) {
  return { ...scaleStatus(photo, rotationDeg), frame: frameFor(photo, tipAtTop) };
}
