"use client";

import { useEffect, useState } from "react";
import { getFindingHistory, type HistoryEntry } from "@/lib/inspections/viewer-actions";
import { fmtDateTime, historyLines } from "./finding-logic";

type State = { key: string; entries: HistoryEntry[] | null; error: string | null };

/**
 * Historial de cambios del daño (`change_log`, solo personal). Se lee en el servidor con la sesión
 * al elegir el daño y otra vez cuando cambia (`version` = `updated_at`).
 */
export function HistoryPanel({ findingId, version, typeLabels }: { findingId: string; version: string; typeLabels: Record<string, string> }) {
  const key = `${findingId}@${version}`;
  const [state, setState] = useState<State>({ key: "", entries: null, error: null });

  useEffect(() => {
    let alive = true;
    getFindingHistory(findingId)
      .then((r) => alive && setState(r.ok ? { key, entries: r.entries, error: null } : { key, entries: null, error: r.message }))
      .catch(() => alive && setState({ key, entries: null, error: "No se pudo leer el historial." }));
    return () => {
      alive = false;
    };
  }, [findingId, key]);

  const loading = state.key !== key;
  return (
    <section className="flex flex-col gap-2" data-testid="history">
      <p className="label-caps">Historial</p>
      {loading && !state.entries && <p className="text-xs text-foreground-muted">Cargando…</p>}
      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
      {state.entries?.length === 0 && <p className="text-xs text-foreground-muted">Sin cambios registrados.</p>}
      <ol className="flex flex-col gap-1.5">
        {state.entries?.map((e) => (
          <li key={e.id} className="border-l-2 border-border-subtle pl-2 text-xs" data-testid="history-entry">
            <p className="text-2xs text-foreground-muted">
              <time dateTime={e.at} suppressHydrationWarning>
                {fmtDateTime(e.at)}
              </time>{" "}
              · {e.actor}
            </p>
            {historyLines(e.action, e.old, e.new, typeLabels).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
