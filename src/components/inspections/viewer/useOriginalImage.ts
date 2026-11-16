"use client";

import { useEffect, useRef, useState } from "react";
import { getOriginalUrl } from "@/lib/inspections/viewer-actions";
import { needsOriginal, shouldRequestOriginal } from "./viewer-logic";

type Photo = { id: string; width_px: number };

async function fetchOriginalUrl(id: string): Promise<{ url: string } | { message: string }> {
  try {
    const r = await getOriginalUrl(id);
    return r.ok ? { url: r.url } : { message: r.message };
  } catch {
    return { message: "No se pudo obtener el original." };
  }
}

/**
 * Cambio de vista previa a original: se pide la URL firmada del original cuando el zoom supera la
 * resolución de la vista previa, se guarda por foto y, si la imagen no carga (URL vencida), se
 * reintenta una sola vez.
 */
export function useOriginalImage(photo: Photo, zoom: number, onMessage: (m: string) => void) {
  const [previewW, setPreviewW] = useState<Record<string, number>>({});
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const inFlight = useRef(new Set<string>());
  const messageRef = useRef(onMessage);
  messageRef.current = onMessage;

  const id = photo.id;
  const want = needsOriginal(zoom, previewW[id] ?? null, photo.width_px);
  const cached = originals[id] != null;
  const tries = attempts[id] ?? 0;

  useEffect(() => {
    if (!shouldRequestOriginal({ want, cached, inFlight: inFlight.current.has(id), attempts: tries })) return;
    inFlight.current.add(id);
    setAttempts((a) => ({ ...a, [id]: (a[id] ?? 0) + 1 }));
    void fetchOriginalUrl(id).then((r) => {
      inFlight.current.delete(id);
      if ("url" in r) setOriginals((o) => ({ ...o, [id]: r.url }));
      else messageRef.current(r.message);
    });
  }, [want, cached, tries, id]);

  /** La imagen del original no cargó: se borra de la caché y el efecto reintenta si quedan intentos. */
  const onOriginalError = () => setOriginals(({ [id]: _gone, ...rest }) => rest);

  const onPreviewSize = (w: number) => setPreviewW((m) => (m[id] === w ? m : { ...m, [id]: w }));

  /** URL nueva para descargar (no se reutiliza la de la caché, que puede haber vencido). */
  const freshOriginalUrl = async (): Promise<string | null> => {
    const r = await fetchOriginalUrl(id);
    if ("url" in r) return r.url;
    messageRef.current(r.message);
    return null;
  };

  /** Descarga el original con una URL nueva y el nombre de archivo de la foto. */
  const [downloading, setDownloading] = useState(false);
  const download = async (fileName: string) => {
    setDownloading(true);
    const url = await freshOriginalUrl();
    setDownloading(false);
    if (!url) return;
    const a = document.createElement("a");
    a.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
    a.rel = "noopener";
    a.click();
  };

  return { originalUrl: originals[id] ?? null, onPreviewSize, onOriginalError, freshOriginalUrl, download, downloading };
}

/** Precarga imágenes (p. ej. las vistas previas de las 2 fotos vecinas). */
export function usePreloadImages(a: string | null | undefined, b: string | null | undefined) {
  useEffect(() => {
    for (const url of [a, b]) if (url) new Image().src = url;
  }, [a, b]);
}
