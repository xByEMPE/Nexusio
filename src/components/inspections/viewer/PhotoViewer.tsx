"use client";

import { useMemo, useRef, useState } from "react";
import { screenToImage, type Pt, type Region } from "@/lib/blade";
import type { ViewerCapabilities } from "@/lib/inspections/capabilities";
import { updateFinding } from "@/lib/inspections/viewer-actions";
import { BladeModel2D } from "./BladeModel2D";
import type { ViewerComment, ViewerFinding, ViewerFindingType } from "./finding-data";
import { hitFinding, type Me } from "./finding-logic";
import { NewFindingTools } from "./FindingEditor";
import { FindingShapes } from "./FindingShapes";
import { ImageStage, DEFAULT_FILTERS, type ImageFilters } from "./ImageStage";
import { SplitStage } from "./OtherFaces";
import { OverlayLayer } from "./OverlayLayer";
import type { ViewerPhoto } from "./photo-data";
import { BottomRuler, Ruler } from "./Ruler";
import { StageHud } from "./StageHud";
import { ThermalCanvas, ThermalShapes } from "./ThermalCanvas";
import { SpectrumSwitch, ThermalControls } from "./ThermalControls";
import { thermalPair } from "./thermal-logic";
import { Toolbar, type Tool } from "./Toolbar";
import { useAreaTool } from "./useAreaTool";
import { useElementSize, useIsDesktop } from "./useElementSize";
import { useFindingEditing } from "./useFindingEditing";
import { useOriginalImage, usePreloadImages } from "./useOriginalImage";
import { useRulers } from "./useRulers";
import { useStablePhotos } from "./useStablePhotos";
import { useStageGestures } from "./useStageGestures";
import { useThermal } from "./useThermal";
import { useViewerKeys } from "./useViewerKeys";
import { useViewerMutation } from "./useViewerMutation";
import { useViewerSelection } from "./useViewerSelection";
import { useViewState } from "./useViewState";
import { ViewerSidePanel } from "./ViewerSidePanel";
import { cancelApplies, crosshairText, frameFor, neighbors, scaleStatus } from "./viewer-logic";

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

/** Visor de fotos de palas (contenedor y estado). Lo comparten admin y portal; cada uno pasa sus permisos. */
export function PhotoViewer({ data, mode, capabilities }: { data: PhotoViewerData; mode: "staff" | "client"; capabilities: ViewerCapabilities }) {
  const { tipAtTop, findings, me } = data;
  const photos = useStablePhotos(data.photos);
  const sel = useViewerSelection({
    initialPhotoId: data.initialPhotoId,
    initialFindingId: data.initialFindingId,
    findings,
    onPhotoChange: () => {
      reset();
      areaTool.clear();
      thermal.clear();
      editing.clearDraft();
      setMessage(null);
    },
  });
  const photo = photos.find((p) => p.id === sel.currentId) ?? photos[0]!;
  const nav = neighbors(photos, photo.id);

  const stageRef = useRef<HTMLDivElement>(null);
  const container = useElementSize(stageRef);
  const image = { w: photo.width_px, h: photo.height_px };
  const rulers = useRulers(photo);
  const { view, zoomBy, panBy, rotate, fit, reset } = useViewState(image, container, rulers.insetsFor);

  const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
  const [tool, setTool] = useState<Tool>("move");
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const status = { ...scaleStatus(photo, view.rotationDeg), frame: frameFor(photo, tipAtTop) };
  const { insets, left: rulerShown, bottom: bottomRulerShown } = rulers.layout(view.rotationDeg);
  const desktop = useIsDesktop();
  const canEditHere = capabilities.editFindings && desktop;

  // --- Daños de la foto y de la pala -----------------------------------------------------------
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const typeLabels = useMemo(() => Object.fromEntries(data.findingTypes.map((t) => [t.id, t.label])), [data.findingTypes]);
  const photoFindings = findings.filter((f) => f.capture_id === photo.id);
  const bladeFindings = findings.filter((f) => f.capture_id && photoById.get(f.capture_id)?.blade === photo.blade);
  const selected = findings.find((f) => f.id === sel.selectedId) ?? null;
  const splitPhoto = sel.splitId ? (photoById.get(sel.splitId) ?? null) : null;

  // --- Modo térmico: la foto térmica se muestra con su propia matriz y su propio ViewState ------
  const thermal = useThermal(photo);

  const regionMut = useViewerMutation();
  const editing = useFindingEditing({
    tool,
    view,
    image,
    selected: selected?.capture_id === photo.id ? selected : null,
    canEdit: canEditHere,
    thermalToolActive: thermal.active && thermal.tool !== "off",
    onSaveRegion: (id: string, region: Region) => regionMut.run(updateFinding, { id, region: JSON.stringify(region) }),
  });
  const pair = thermalPair(photos, photo);
  const thermalShown = thermal.active && thermal.matrix != null && thermal.range != null;

  const goPrev = nav.prev ? () => sel.goTo(nav.prev!.id) : null;
  const goNext = nav.next ? () => sel.goTo(nav.next!.id) : null;

  usePreloadImages(nav.prev?.previewUrl, nav.next?.previewUrl); // vistas previas de las 2 vecinas

  // --- Vista previa → original -----------------------------------------------------------------
  const original = useOriginalImage(photo, view.zoom, setMessage);

  // --- Herramientas ----------------------------------------------------------------------------
  const measuring = tool === "area" || tool === "distance";
  const areaTool = useAreaTool({ mode: measuring ? tool : null, view, gsd: photo.gsd_mm_px });
  const chooseTool = (t: Tool) => {
    setTool(t);
    if (t !== "move") thermal.chooseTool("off");
    areaTool.cancelDraft();
    editing.clearDraft();
    setMessage(null);
  };

  const closeShape = () => {
    if (tool === "newPolygon") setMessage(editing.closePolygon());
  };

  useViewerKeys({
    prev: () => (goPrev ? (goPrev(), true) : false),
    next: () => (goNext ? (goNext(), true) : false),
    zoomIn: () => (zoomBy(KEY_STEP), true),
    zoomOut: () => (zoomBy(1 / KEY_STEP), true),
    fit: () => (fit(), true),
    cancel: () => (cancelApplies(tool, areaTool.draft != null || editing.draft != null || thermal.busy) ? (thermal.clear(), chooseTool("move"), true) : false),
  });

  // --- Puntero: arrastre = desplazar (o mover un asa); clic = vértice o elegir daño; dos dedos = zoom
  const gestures = useStageGestures(stageRef, {
    zoomBy,
    panBy,
    onHover: (p) => {
      setCursor(p);
      editing.hover(p);
      areaTool.hover(p);
      thermal.hover(p && screenToImage(p, view));
    },
    onTap: (p) => {
      if (thermal.tap(screenToImage(p, view), tool)) return;
      if (editing.tap(p)) return;
      if (tool === "move") {
        const id = hitFinding(photoFindings, screenToImage(p, view), image);
        return sel.select(id ? (findings.find((f) => f.id === id) ?? null) : null);
      }
      if (measuring && status.canMeasure) areaTool.tap(p);
    },
    onPressStart: editing.pressStart,
    onPressMove: editing.pressMove,
    onPressEnd: (p) => void editing.pressEnd(p),
  });

  const crosshair = tool === "crosshair" && cursor ? { screen: cursor, text: crosshairText(screenToImage(cursor, view), status.frame) } : null;
  const measured = container.w > 0 && container.h > 0;
  const drawing = measuring || ((tool === "newBox" || tool === "newPolygon") && !editing.draftRegion);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2px] border border-border-subtle" data-mode={mode}>
      <Toolbar
        {...{ fileName: photo.file_name, blade: photo.blade, face: photo.face, onPrev: goPrev, onNext: goNext, zoom: view.zoom, onFit: fit, filters, onFilters: setFilters, tool, downloading: original.downloading }}
        position={{ index: nav.index, total: nav.total }}
        onZoomIn={() => zoomBy(KEY_STEP)}
        onZoomOut={() => zoomBy(1 / KEY_STEP)}
        rotationDeg={view.rotationDeg}
        onRotate={rotate}
        onTool={chooseTool}
        canMeasure={status.canMeasure}
        rulerOn={rulers.on}
        rulerAvailable={status.ruler || status.bottomRuler}
        onToggleRuler={rulers.toggle}
        onDownload={() => void original.download(photo.file_name)}
        spectrumSwitch={pair ? <SpectrumSwitch thermalActive={photo.spectrum === "thermal"} rgbId={pair.rgbId} thermalId={pair.thermalId} onGo={sel.goTo} /> : undefined}
        editTools={canEditHere ? <NewFindingTools tool={tool} onTool={chooseTool} /> : undefined}
        panelToggle={
          <button type="button" className="inline-flex h-8 items-center rounded-[2px] border border-border-subtle px-2.5 text-xs" onClick={() => sel.setPanelOpen(true)} data-testid="panel-open">
            Daños ({bladeFindings.length})
          </button>
        }
      />

      {thermal.active && <ThermalControls t={thermal} onThermalTool={(t) => { thermal.chooseTool(t); if (t !== "off") chooseTool("move"); }} cursorC={thermal.temperatureAt(cursor && screenToImage(cursor, view))} />}

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
                {thermalShown ? (
                  <ThermalCanvas key={photo.id} view={view} matrix={thermal.matrix!} palette={thermal.palette} min={thermal.range!.min} max={thermal.range!.max} />
                ) : (
                <ImageStage
                  key={photo.id}
                  {...{ view, filters, previewUrl: photo.previewUrl, originalUrl: original.originalUrl, onPreviewSize: original.onPreviewSize, onOriginalError: original.onOriginalError }}
                  alt={`${photo.file_name}${photo.blade ? ` · pala ${photo.blade}` : ""}${photo.face ? ` · ${photo.face}` : ""}`}
                />
                )}
                <OverlayLayer
                  view={view}
                  crosshair={crosshair}
                  measureDraft={areaTool.draft}
                  measurements={areaTool.measurements}
                  distances={areaTool.distances}
                  onRemoveMeasurement={areaTool.remove}
                  shapes={
                    <>
                      <FindingShapes findings={photoFindings} image={image} zoom={view.zoom} selectedId={sel.selectedId} override={editing.override} handles={editing.handles} draft={editing.draft} />
                      <ThermalShapes shape={thermal.shape} />
                    </>
                  }
                />
                {rulerShown && status.frame && <Ruler view={view} frame={status.frame} estimated={status.estimated} bottom={insets.bottom} />}
                {bottomRulerShown && <BottomRuler view={view} gsd={photo.gsd_mm_px!} estimated={status.estimated} left={insets.left} />}
              </>
            )}
            <StageHud
              status={status}
              rulerShown={rulerShown || bottomRulerShown}
              insets={insets}
              notice={message ?? regionMut.error}
              tool={tool}
              drawing={drawing}
              points={editing.draft?.points.length ?? 0}
              onCloseShape={closeShape}
              measurementCount={areaTool.count}
              onClearMeasurements={areaTool.clear}
              newFinding={
                editing.draftRegion
                  ? { inspectionId: data.inspectionId, captureId: photo.id, region: editing.draftRegion, types: data.findingTypes, onDone: () => chooseTool("move"), onCancel: editing.clearDraft }
                  : null
              }
            />
          </div>
          {splitPhoto && (
            <SplitStage
              key={splitPhoto.id}
              photo={splitPhoto}
              findings={findings.filter((f) => f.capture_id === splitPhoto.id)}
              onClose={() => sel.setSplitId(null)}
              onOpen={() => sel.goTo(splitPhoto.id)}
            />
          )}
        </div>

        <aside className="hidden w-24 shrink-0 border-l border-border-subtle p-1 text-foreground lg:block" aria-label="Modelo de la pala">
          <BladeModel2D
            blade_length_m={data.bladeLengthM}
            findings={bladeFindings}
            captures={photos.filter((p) => p.blade === photo.blade)}
            currentRadius={photo.radius_center_m}
            selectedId={sel.selectedId}
            onSelect={sel.select}
          />
        </aside>

        <ViewerSidePanel
          {...{ desktop, photos, photo, selected, bladeFindings, typeLabels, capabilities, me }}
          {...{ open: sel.panelOpen, splitId: sel.splitId, selectedId: sel.selectedId, onSelect: sel.select }}
          {...{ types: data.findingTypes, inspectionId: data.inspectionId, comments: data.comments }}
          onClose={() => sel.setPanelOpen(false)}
          onPickSplit={(p) => sel.setSplitId(p.id === sel.splitId ? null : p.id)}
          canEdit={canEditHere}
        />
      </div>
    </div>
  );
}
