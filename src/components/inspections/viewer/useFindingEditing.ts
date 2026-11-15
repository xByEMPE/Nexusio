"use client";

import { useState } from "react";
import { imageToScreen, screenToImage, type Pt, type Region, type ViewState } from "@/lib/blade";
import type { ViewerFinding } from "./finding-data";
import { MIN_POLYGON_POINTS, moveVertex, nearestHandle, regionPoints, toRegion } from "./finding-logic";
import type { ShapeDraft } from "./FindingShapes";
import type { Tool } from "./Toolbar";
import { addVertex, type Size } from "./viewer-logic";

const DUP_PX = 4;
const MIN_BOX_PX = 6;

const regionKey = (r: Region | null) => JSON.stringify(r);

/**
 * Dibujo de un daño nuevo (recuadro con 2 clics; polígono con clics y «Cerrar») y edición de
 * vértices del daño elegido arrastrando sus asas. La región se guarda al soltar el asa.
 */
export function useFindingEditing({
  tool,
  view,
  image,
  selected,
  canEdit,
  onSaveRegion,
}: {
  tool: Tool;
  view: ViewState;
  image: Size;
  selected: ViewerFinding | null;
  canEdit: boolean;
  onSaveRegion: (id: string, region: Region) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<(ShapeDraft & { ready: boolean }) | null>(null);
  const [drag, setDrag] = useState<{ id: string; index: number; region: Region } | null>(null);
  const [saved, setSaved] = useState<{ id: string; region: Region; baseKey: string } | null>(null);

  const drawType: Region["type"] | null = tool === "newBox" ? "box" : tool === "newPolygon" ? "polygon" : null;

  // Región mostrada del daño elegido: la del arrastre, la recién guardada (hasta que llegue del servidor) o la suya.
  const pendingSaved = saved && selected && saved.id === selected.id && saved.baseKey === regionKey(selected.region) ? saved : null;
  const override = drag ?? pendingSaved;
  const editRegion = selected ? (override?.id === selected.id ? override.region : selected.region) : null;
  const handles = canEdit && selected && editRegion && !drawType ? regionPoints(editRegion, image) : null;

  /** Clic en la foto con una herramienta de daño nuevo; devuelve si lo usó. */
  const tap = (screen: Pt): boolean => {
    if (!drawType) return false;
    const p = screenToImage(screen, view);
    if (p.x < 0 || p.y < 0 || p.x > image.w || p.y > image.h) return true;
    setDraft((cur) => {
      if (cur?.ready) return cur;
      const base = cur && cur.type === drawType ? cur : { type: drawType, points: [], cursor: null, ready: false };
      if (drawType === "box") {
        if (base.points.length === 0) return { ...base, points: [p], cursor: p };
        const a = base.points[0]!;
        if (Math.abs(a.x - p.x) * view.zoom < MIN_BOX_PX || Math.abs(a.y - p.y) * view.zoom < MIN_BOX_PX) return base;
        return { ...base, points: [a, p], cursor: null, ready: true };
      }
      return { ...base, points: addVertex(base.points, p, DUP_PX / view.zoom), cursor: p };
    });
    return true;
  };

  const hover = (screen: Pt | null) => {
    if (!drawType) return;
    const cursor = screen ? screenToImage(screen, view) : null;
    // Actualización funcional: un movimiento justo después de un clic no debe pisar el vértice nuevo.
    setDraft((cur) => (!cur || cur.ready ? cur : { ...cur, cursor }));
  };

  /** Cierra el polígono; devuelve un aviso si faltan puntos. */
  const closePolygon = (): string | null => {
    if (!draft || draft.type !== "polygon" || draft.ready) return null;
    if (draft.points.length < MIN_POLYGON_POINTS) return `Marca al menos ${MIN_POLYGON_POINTS} puntos para cerrar.`;
    setDraft({ ...draft, cursor: null, ready: true });
    return null;
  };

  const draftRegion: Region | null = draft?.ready ? toRegion(draft.type, draft.points, image) : null;

  // --- Asas ------------------------------------------------------------------------------------
  const pressStart = (screen: Pt): boolean => {
    if (!handles || !selected || !editRegion) return false;
    const i = nearestHandle(handles.map((h) => imageToScreen(h, view)), screen);
    if (i == null) return false;
    setDrag({ id: selected.id, index: i, region: editRegion });
    return true;
  };

  const pressMove = (screen: Pt) => {
    if (!drag) return;
    const p = screenToImage(screen, view);
    setDrag({ ...drag, region: moveVertex(drag.region, drag.index, p, image) });
  };

  const pressEnd = async (screen: Pt | null) => {
    const d = drag;
    setDrag(null);
    if (!d || !screen || !selected) return;
    const region = moveVertex(d.region, d.index, screenToImage(screen, view), image);
    if (regionKey(region) === regionKey(selected.region)) return;
    setSaved({ id: d.id, region, baseKey: regionKey(selected.region) });
    const ok = await onSaveRegion(d.id, region);
    if (!ok) setSaved(null);
  };

  return {
    draft,
    draftRegion,
    clearDraft: () => setDraft(null),
    tap,
    hover,
    closePolygon,
    handles,
    override: override ? { id: override.id, region: override.region } : null,
    pressStart,
    pressMove,
    pressEnd,
    dragging: drag != null,
  };
}
