"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok: true } | { ok: false; message: string };

/**
 * Llama una acción del servidor con FormData y, si sale bien, recarga los datos del servidor
 * (`router.refresh()`): la foto (`?foto=`) y la selección se conservan porque el visor no se desmonta.
 */
export function useViewerMutation() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: (fd: FormData) => Promise<Result>, fields: Record<string, string | undefined>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.set(k, v);
    let res: Result;
    try {
      res = await action(fd);
    } catch {
      res = { ok: false, message: "No se pudo completar la acción. Intenta de nuevo." };
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  };

  return { run, pending: busy || refreshing, error, clearError: () => setError(null) };
}
