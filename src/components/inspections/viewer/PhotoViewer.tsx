"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { screenToImage, type Pt } from "@/lib/blade";
import type { ViewerCapabilities } from "@/lib/inspections/capabilities";
import { getOriginalUrl } from "@/lib/inspections/viewer-actions";
import { ImageStage, DEFAULT_FILTERS, type ImageFilters } from "./ImageStage";
import { OverlayLayer, type AreaDraft } from "./OverlayLayer";
import type { ViewerPhoto } from "./photo-data";
import { Ruler, RULER_W } from "./Ruler";
import { Toolbar, type Tool } from "./Toolbar";
import { useViewState } from "./useViewState";
import {
  addVertex,
  areaReadout,
  crosshairText,
  frameFor,
  keyAction,
  MIN_AREA_POINTS,
  needsOriginal,
  neighbors,
  scaleStatus,
  type Size,
} from "./viewer-logic";

export type PhotoViewerData = {
  photos: ViewerPhoto[];
  initialPhotoId: string;
  /** Orientación de las fotos de VND (punta arriba); viene del servidor (`TIP_AT_TOP`). */
  tipAtTop: boolean;
};

const WHEEL_STEP = 1.15;
const KEY_STEP = 1.25;
const DRAG_THRESHOLD_PX = 4;
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
  const [previewW, setPreviewW] = useState<Record<string, number>>({});
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());
  const failed = useRef(new Set<string>());

  const requestOriginal = async (id: string): Promise<string | null> => {
    if (originals[id]) return originals[id]!;
    try {
      const r = await getOriginalUrl(id);
      if (r.ok) {
        setOriginals((o) => ({ ...o, [id]: r.url }));
        return r.url;
      }
      setMessage(r.message);
    } catch {
      setMessage("No se pudo obtener el original.");
    }
    return null;
  };

  const wantOriginal = needsOriginal(view.zoom, previewW[photo.id] ?? null, photo.width_px);
  useEffect(() => {
    if (!wantOriginal || requested.current.has(photo.id)) return;
    requested.current.add(photo.id);
    void requestOriginal(photo.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se pide una vez por foto
  }, [wantOriginal, photo.id]);

  const onOriginalError = () => {
    // La URL firmada pudo vencer: se permite un reintento por foto.
    setOriginals(({ [photo.id]: _gone, ...rest }) => rest);
    if (!failed.current.has(photo.id)) {
      failed.current.add(photo.id);
      requested.current.delete(photo.id);
    }
  };

  const download = async () => {
    setDownloading(true);
    const url = await requestOriginal(photo.id);
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

  const actions = {
    prev: () => goPrev?.(),
    next: () => goNext?.(),
    zoomIn: () => zoomBy(KEY_STEP),
    zoomOut: () => zoomBy(1 / KEY_STEP),
    fit: () => fit(),
    cancel,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const a = keyAction(e.key);
      if (!a) return;
      e.preventDefault();
      actionsRef.current[a]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Rueda no pasiva: el zoom (centrado en el cursor) no desplaza la página.
  const zoomRef = useRef(zoomBy);
  zoomRef.current = zoomBy;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // --- Puntero: arrastre = desplazar; clic = vértice; dos dedos = zoom -------------------------
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ start: Pt; last: Pt; moved: boolean; pinch: number | null } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { start: p, last: p, moved: false, pinch: null };
    else if (gesture.current) gesture.current.moved = true; // dos dedos: nunca es un clic
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = local(e);
    setCursor(p);
    if (tool === "area" && area && !area.closed) setArea({ ...area, cursor: screenToImage(p, view) });

    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.pinch && d > 0) zoomBy(d / g.pinch, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      g.pinch = d;
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) > DRAG_THRESHOLD_PX) g.moved = true;
    if (g.moved) panBy(p.x - g.last.x, p.y - g.last.y);
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
    if (!g || g.moved || tool !== "area" || !status.canMeasure) return;
    const img = screenToImage(local(e), view);
    const minDist = DUP_VERTEX_PX / view.zoom;
    setArea((cur) =>
      !cur || cur.closed
        ? { points: [img], closed: false, cursor: img, readout: null }
        : { ...cur, points: addVertex(cur.points, img, minDist) },
    );
  };

  const onDoubleClick = () => {
    if (tool !== "area" || !area || area.closed) return;
    if (area.points.length < MIN_AREA_POINTS) {
      setMessage(`Marca al menos ${MIN_AREA_POINTS} puntos y haz doble clic para cerrar.`);
      return;
    }
    setMessage(null);
    setArea({ ...area, closed: true, cursor: null, readout: areaReadout(area.points, image, photo.gsd_mm_px) });
  };

  const onPointerLeave = () => setCursor(null);

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        data-testid="stage"
        data-original={originals[photo.id] ? "requested" : "preview"}
      >
        {measured && (
          <>
            <ImageStage
              key={photo.id}
              view={view}
              previewUrl={photo.previewUrl}
              originalUrl={originals[photo.id] ?? null}
              alt={`${photo.file_name}${photo.blade ? ` · pala ${photo.blade}` : ""}${photo.face ? ` · ${photo.face}` : ""}`}
              filters={filters}
              onPreviewSize={(w) => setPreviewW((m) => (m[photo.id] === w ? m : { ...m, [photo.id]: w }))}
              onOriginalError={onOriginalError}
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
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 text-2xs" style={{ marginLeft: rulerShown ? RULER_W / 2 : 0 }}>
            <Notice>Clic en cada vértice · doble clic para cerrar · Esc para cancelar</Notice>
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
