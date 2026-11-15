"use client";

import { useEffect, useRef, useState } from "react";
import type { ViewerFinding } from "./finding-data";

function setUrl(foto: string, dano: string | null) {
  // Solo cambia la URL (sin volver a pedir la página). Con estado null Next sincroniza su router con
  // la URL nueva, así router.refresh() conserva ?foto= y ?dano=.
  const url = new URL(window.location.href);
  url.searchParams.set("foto", foto);
  if (dano) url.searchParams.set("dano", dano);
  else url.searchParams.delete("dano");
  window.history.replaceState(null, "", url);
}

/**
 * Foto actual, daño elegido, foto de la vista doble y panel deslizable, sincronizados con
 * `?foto=` y `?dano=`. `onPhotoChange` limpia lo que depende de la foto (vista, borradores).
 */
export function useViewerSelection({
  initialPhotoId,
  initialFindingId,
  findings,
  onPhotoChange,
}: {
  initialPhotoId: string;
  initialFindingId: string | null;
  findings: ViewerFinding[];
  onPhotoChange: () => void;
}) {
  const [currentId, setCurrentId] = useState(initialPhotoId);
  const [selectedId, setSelectedId] = useState<string | null>(initialFindingId);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(initialFindingId != null);

  const goTo = (id: string, findingId: string | null = null) => {
    if (id !== currentId) {
      setCurrentId(id);
      setSplitId(null);
      onPhotoChange();
    }
    setSelectedId(findingId);
    setUrl(id, findingId);
  };

  const select = (f: ViewerFinding | null) => {
    goTo(f?.capture_id ?? currentId, f?.id ?? null);
    if (f) setPanelOpen(true);
  };

  // Si el daño elegido desaparece (borrado o ya no visible tras recargar), se quita la selección y ?dano=.
  const current = useRef(currentId);
  current.current = currentId;
  const gone = selectedId != null && !findings.some((f) => f.id === selectedId);
  useEffect(() => {
    if (!gone) return;
    setSelectedId(null);
    setUrl(current.current, null);
  }, [gone]);

  return { currentId, selectedId, splitId, setSplitId, panelOpen, setPanelOpen, goTo, select };
}
