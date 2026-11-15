"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { screenToImage, type Pt, type Region } from "@/lib/blade";
import type { ViewerCapabilities } from "@/lib/inspections/capabilities";
import { updateFinding } from "@/lib/inspections/viewer-actions";
import { cn } from "@/lib/cn";
import { BladeModel2D } from "./BladeModel2D";
import { CommentsThread } from "./CommentsThread";
import type { ViewerComment, ViewerFinding, ViewerFindingType } from "./finding-data";
import { hitFinding, MIN_POLYGON_POINTS, type Me } from "./finding-logic";
import { NewFindingForm, NewFindingTools } from "./FindingEditor";
import { FindingList } from "./FindingList";
import { FindingPanel } from "./FindingPanel";
import { FindingShapes } from "./FindingShapes";
import { ImageStage, DEFAULT_FILTERS, type ImageFilters } from "./ImageStage";
import { OtherFaces, SplitStage } from "./OtherFaces";
import { OverlayLayer, type AreaDraft } from "./OverlayLayer";
import type { ViewerPhoto } from "./photo-data";
import { Ruler, RULER_W } from "./Ruler";
import { Toolbar, type Tool } from "./Toolbar";
import { useElementSize, useIsDesktop } from "./useElementSize";
import { useFindingEditing } from "./useFindingEditing";
import { useOriginalImage } from "./useOriginalImage";
import { useStablePhotos } from "./useStablePhotos";
import { useStageGestures } from "./useStageGestures";
import { useViewerMutation } from "./useViewerMutation";
import { useViewState } from "./useViewState";
import { addVertex, areaReadout, cancelApplies, crosshairText, frameFor, keyAction, MIN_AREA_POINTS, neighbors, scaleStatus, type KeyAction } from "./viewer-logic";

export type PhotoViewerData = {
  photos: ViewerPhoto[];
  initialPhotoId: string;
  initialFindingId: string | null;
  /** Orientación de las fotos de VND (punta arriba); viene del servidor (`TIP_AT_TOP`). */
  tipAtTop: boolean;
  inspectionId: string;
  bladeLengthM: number | null;
  /** Daños y comentarios tal como RLS los devuelve a la sesión. */
  findings: ViewerFinding[];
  findingTypes: ViewerFindingType[];
  comments: ViewerComment[];
  me: Me;
};

const KEY_STEP = 1.25;
const DUP_VERTEX_PX = 4;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

function setUrl(foto: string, dano: string | null) {
  // Solo cambia la URL (sin volver a pedir la página al servidor ni recargar).
  const url = new URL(window.location.href);
  url.searchParams.set("foto", foto);
  if (dano) url.searchParams.set("dano", dano);
  else url.searchParams.delete("dano");
  // Con estado null Next sincroniza su router con la URL nueva (así router.refresh() conserva ?foto= y ?dano=).
  window.history.replaceState(null, "", url);
}

/** Visor de fotos de palas (contenedor y estado). Lo comparten admin y portal; cada uno pasa sus permisos. */
export function PhotoViewer({ data, mode, capabilities }: { data: PhotoViewerData; mode: "staff" | "client"; capabilities: ViewerCapabilities }) {
  const { tipAtTop, findings, me } = data;
  const photos = useStablePhotos(data.photos);
  const [currentId, setCurrentId] = useState(data.initialPhotoId);
  const photo = photos.find((p) => p.id === currentId) ?? photos[0]!;
  const nav = neighbors(photos, photo.id);

  const stageRef = useRef<HTMLDivElement>(null);
  const container = useElementSize(stageRef);
  const image = { w: photo.width_px, h: photo.height_px };
  const { view, zoomBy, panBy, rotate, fit, reset } = useViewState(image, container);

  const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
  const [tool, setTool] = useState<Tool>("move");
  const [rulerOn, setRulerOn] = useState(true);
  const [area, setArea] = useState<AreaDraft | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(data.initialFindingId);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(data.initialFindingId != null);

  const status = frameStatus(photo, view.rotationDeg, tipAtTop);
  const desktop = useIsDesktop();
  const canEditHere = capabilities.editFindings && desktop;

  // --- Daños de la foto y de la pala -----------------------------------------------------------
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const typeLabels = useMemo(() => Object.fromEntries(data.findingTypes.map((t) => [t.id, t.label])), [data.findingTypes]);
  const photoFindings = findings.filter((f) => f.capture_id === photo.id);
  const bladeFindings = findings.filter((f) => f.capture_id && photoById.get(f.capture_id)?.blade === photo.blade);
  const bladePhotos = photos.filter((p) => p.blade === photo.blade);
  const selected = findings.find((f) => f.id === selectedId) ?? null;
  const splitPhoto = splitId ? (photoById.get(splitId) ?? null) : null;

  const regionMut = useViewerMutation();
  const editing = useFindingEditing({
    tool,
    view,
    image,
    selected: selected?.capture_id === photo.id ? selected : null,
    canEdit: canEditHere,
    onSaveRegion: (id: string, region: Region) => regionMut.run(updateFinding, { id, region: JSON.stringify(region) }),
  });

  // --- Navegación -----------------------------------------------------------------------------
  const goTo = (id: string, findingId: string | null = null) => {
    if (id !== photo.id) {
      setCurrentId(id);
      reset();
      setArea(null);
      editing.clearDraft();
      setSplitId(null);
      setMessage(null);
    }
    setSelectedId(findingId);
    setUrl(id, findingId);
  };
  const goPrev = nav.prev ? () => goTo(nav.prev!.id) : null;
  const goNext = nav.next ? () => goTo(nav.next!.id) : null;
  const select = (f: ViewerFinding | null) => {
    goTo(f?.capture_id ?? photo.id, f?.id ?? null);
    if (f) setPanelOpen(true);
  };

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
    editing.clearDraft();
    setMessage(null);
  };
  const cancel = () => chooseTool("move");

  const closeShape = () => {
    if (tool === "newPolygon") {
      setMessage(editing.closePolygon());
      return;
    }
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
    cancel: () => (cancelApplies(tool, area != null || editing.draft != null) ? (cancel(), true) : false),
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

  // --- Puntero: arrastre = desplazar (o mover un asa); clic = vértice o elegir daño; dos dedos = zoom
  const gestures = useStageGestures(stageRef, {
    zoomBy,
    panBy,
    onHover: (p) => {
      setCursor(p);
      editing.hover(p);
      if (p && tool === "area") {
        const c = screenToImage(p, view);
        setArea((cur) => (cur && !cur.closed ? { ...cur, cursor: c } : cur));
      }
    },
    onTap: (p) => {
      if (editing.tap(p)) return;
      const img = screenToImage(p, view);
      if (tool === "move") {
        const id = hitFinding(photoFindings, img, image);
        select(id ? (findings.find((f) => f.id === id) ?? null) : null);
        return;
      }
      if (tool !== "area" || !status.canMeasure) return;
      const minDist = DUP_VERTEX_PX / view.zoom;
      setArea((cur) => (!cur || cur.closed ? { points: [img], closed: false, cursor: img, readout: null } : { ...cur, points: addVertex(cur.points, img, minDist) }));
    },
    onPressStart: editing.pressStart,
    onPressMove: editing.pressMove,
    onPressEnd: (p) => void editing.pressEnd(p),
  });

  const crosshair = tool === "crosshair" && cursor ? { screen: cursor, text: crosshairText(screenToImage(cursor, view), status.frame) } : null;
  const measured = container.w > 0 && container.h > 0;
  const rulerShown = rulerOn && status.ruler && status.frame != null;
  const drawing = tool === "area" ? !area?.closed : (tool === "newBox" || tool === "newPolygon") && !editing.draftRegion;
  const notice = message ?? regionMut.error;

  const sidePanel = (
    <>
      <OtherFaces photos={photos} current={photo} splitId={splitId} onPick={(p) => setSplitId(p.id === splitId ? null : p.id)} />
      {selected && (
        <div className="border-t border-border-subtle pt-3">
          <FindingPanel
            finding={selected}
            types={data.findingTypes}
            typeLabels={typeLabels}
            capabilities={capabilities}
            inspectionId={data.inspectionId}
            comments={data.comments}
            me={me}
            onClose={() => select(null)}
          />
        </div>
      )}
      <div className="border-t border-border-subtle pt-3">
        <FindingList findings={bladeFindings} photoFace={new Map(photos.map((p) => [p.id, p.face]))} currentPhotoId={photo.id} selectedId={selectedId} typeLabels={typeLabels} onSelect={select} />
      </div>
      {!selected && (
        <div className="border-t border-border-subtle pt-3">
          <CommentsThread inspectionId={data.inspectionId} comments={data.comments} canComment={capabilities.comment} me={me} />
        </div>
      )}
    </>
  );

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
        editTools={canEditHere ? <NewFindingTools tool={tool} onTool={chooseTool} /> : undefined}
        panelToggle={
          <button type="button" className="inline-flex h-8 items-center rounded-[2px] border border-border-subtle px-2.5 text-xs" onClick={() => setPanelOpen(true)} data-testid="panel-open">
            Daños ({bladeFindings.length})
          </button>
        }
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1">
          <div
            ref={stageRef}
            className="relative min-h-0 min-w-0 flex-1 touch-none select-none overflow-hidden bg-neutral-950"
            style={{ cursor: editing.dragging ? "grabbing" : tool === "move" ? "grab" : "crosshair" }}
            {...gestures}
            onDoubleClick={closeShape}
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
                <OverlayLayer
                  view={view}
                  crosshair={crosshair}
                  area={area}
                  shapes={
                    <FindingShapes
                      findings={photoFindings}
                      image={image}
                      zoom={view.zoom}
                      selectedId={selectedId}
                      override={editing.override}
                      handles={editing.handles}
                      draft={editing.draft}
                    />
                  }
                />
                {rulerShown && <Ruler view={view} frame={status.frame!} estimated={status.estimated} />}
              </>
            )}

            <div className="pointer-events-none absolute right-2 top-2 z-20 flex max-w-[70%] flex-col items-end gap-1 text-2xs">
              {status.noScale && <Notice testId="no-scale">Esta foto no tiene escala</Notice>}
              {!status.noScale && !status.hasRadius && <Notice>Foto sin radio: se mide, pero sin posición en la pala</Notice>}
              {status.hasRadius && !status.ruler && <Notice testId="ruler-hidden">Regla oculta con la foto girada</Notice>}
              {status.estimated && !rulerShown && <Notice>Escala estimada</Notice>}
              {notice && <Notice tone="warn">{notice}</Notice>}
            </div>
            {drawing && (
              <div
                className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 text-2xs"
                style={{ marginLeft: rulerShown ? RULER_W / 2 : 0 }}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Notice>{tool === "newBox" ? "Clic en dos esquinas opuestas · Esc cancela" : "Clic en cada vértice · doble clic o «Cerrar» · Esc cancela"}</Notice>
                {tool !== "newBox" && (
                  <button
                    type="button"
                    onClick={closeShape}
                    disabled={(tool === "area" ? (area?.points.length ?? 0) < MIN_AREA_POINTS : (editing.draft?.points.length ?? 0) < MIN_POLYGON_POINTS)}
                    className="rounded-[2px] bg-sky-500 px-2 py-1 font-medium text-black disabled:opacity-40"
                    data-testid={tool === "area" ? "area-close" : "polygon-close"}
                  >
                    Cerrar
                  </button>
                )}
              </div>
            )}
            {editing.draftRegion && (
              <div className="absolute left-2 top-2 z-30" style={{ marginLeft: rulerShown ? RULER_W : 0 }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <NewFindingForm
                  inspectionId={data.inspectionId}
                  captureId={photo.id}
                  region={editing.draftRegion}
                  types={data.findingTypes}
                  onDone={() => chooseTool("move")}
                  onCancel={editing.clearDraft}
                />
              </div>
            )}
          </div>
          {splitPhoto && (
            <SplitStage
              key={splitPhoto.id}
              photo={splitPhoto}
              findings={findings.filter((f) => f.capture_id === splitPhoto.id)}
              onClose={() => setSplitId(null)}
              onOpen={() => goTo(splitPhoto.id)}
            />
          )}
        </div>

        <aside className="hidden w-24 shrink-0 border-l border-border-subtle p-1 text-foreground lg:block" aria-label="Modelo de la pala">
          <BladeModel2D
            blade_length_m={data.bladeLengthM}
            findings={bladeFindings}
            captures={bladePhotos}
            currentRadius={photo.radius_center_m}
            selectedId={selectedId}
            onSelect={select}
          />
        </aside>

        {panelOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setPanelOpen(false)} aria-hidden />}
        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-40 flex w-[88vw] max-w-sm flex-col gap-3 overflow-y-auto border-l border-border-subtle bg-surface-layer p-3 transition-transform",
            "lg:static lg:z-auto lg:w-80 lg:max-w-none lg:translate-x-0 lg:transition-none",
            panelOpen ? "translate-x-0" : "translate-x-full",
          )}
          aria-label="Daños y otras caras"
          data-testid="side-panel"
        >
          <button type="button" className="self-end text-xs text-foreground-muted lg:hidden" onClick={() => setPanelOpen(false)}>
            Cerrar ✕
          </button>
          {sidePanel}
        </aside>
      </div>
    </div>
  );
}

function Notice({ children, tone, testId }: { children: ReactNode; tone?: "warn"; testId?: string }) {
  return (
    <span className={tone === "warn" ? "rounded-[2px] bg-amber-500/90 px-2 py-1 text-black" : "rounded-[2px] bg-black/70 px-2 py-1 text-neutral-100"} data-testid={testId}>
      {children}
    </span>
  );
}

function frameStatus(photo: ViewerPhoto, rotationDeg: number, tipAtTop: boolean) {
  return { ...scaleStatus(photo, rotationDeg), frame: frameFor(photo, tipAtTop) };
}
