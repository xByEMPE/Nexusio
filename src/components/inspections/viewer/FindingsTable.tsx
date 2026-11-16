"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SEVERITY_COLOR } from "@/lib/inspections/severity";

const STATUS_LABEL = { detected: "Detectado", confirmed: "Confirmado", dismissed: "Descartado" } as const;
const FACES = ["LE", "PS", "TE", "SS"] as const;

export type TableFinding = {
  id: string;
  capture_id: string | null;
  mosaic_id: string | null;
  type_id: string;
  severity: number;
  status: keyof typeof STATUS_LABEL;
  radius_m: number | null;
  length_mm: number | null;
  width_mm: number | null;
};

export type Placed = { id: string; blade: "A" | "B" | "C" | null; face: "TE" | "PS" | "LE" | "SS" | null; file_name?: string };

const selectCls = "rounded-[2px] border border-border-subtle bg-background-base px-2 py-1 text-sm";
const fmt = (n: number | null, unit: string) => (n == null ? "—" : `${Number(n.toFixed(1)).toLocaleString("es-MX")} ${unit}`);

/** Lista filtrable de daños; cada fila enlaza al visor de la foto (y del daño). */
export function FindingsTable({
  findings,
  captures,
  mosaics = [],
  typeLabels,
  viewerBase,
}: {
  findings: TableFinding[];
  captures: Placed[];
  mosaics?: Placed[];
  typeLabels: Record<string, string>;
  viewerBase: string;
}) {
  const [blade, setBlade] = useState("");
  const [face, setFace] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");

  const capBy = useMemo(() => new Map(captures.map((c) => [c.id, c])), [captures]);
  const mosBy = useMemo(() => new Map(mosaics.map((m) => [m.id, m])), [mosaics]);
  const place = (f: TableFinding) => {
    const c = f.capture_id ? capBy.get(f.capture_id) : undefined;
    const m = f.mosaic_id ? mosBy.get(f.mosaic_id) : undefined;
    return { blade: c?.blade ?? m?.blade ?? null, face: c?.face ?? m?.face ?? null, file: c?.file_name ?? null };
  };

  const rows = findings.filter((f) => {
    const p = place(f);
    return (!blade || p.blade === blade) && (!face || p.face === face) && (!severity || f.severity === Number(severity)) && (!status || f.status === status);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="label-caps">Pala</span>
          <select className={selectCls} value={blade} onChange={(e) => setBlade(e.target.value)}>
            <option value="">Todas</option>
            {["A", "B", "C"].map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Cara</span>
          <select className={selectCls} value={face} onChange={(e) => setFace(e.target.value)}>
            <option value="">Todas</option>
            {FACES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Severidad</span>
          <select className={selectCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((s) => (
              <option key={s} value={s}>
                Cat. {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">Estado</span>
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-foreground-muted">
          {findings.length === 0 ? "Esta inspección aún no tiene daños registrados." : "Ningún daño coincide con los filtros."}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="label-caps border-b border-border-subtle">
                <th className="px-3 py-2">Severidad</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Pala</th>
                <th className="px-3 py-2">Cara</th>
                <th className="px-3 py-2">Radio</th>
                <th className="px-3 py-2">Longitudinal</th>
                <th className="px-3 py-2">Transversal</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Foto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const p = place(f);
                const href = f.capture_id ? `${viewerBase}?foto=${f.capture_id}&dano=${f.id}` : null;
                return (
                  <tr key={f.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_COLOR[f.severity] }} />
                        <span className="tabular">Cat. {f.severity}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2">{typeLabels[f.type_id] ?? "—"}</td>
                    <td className="px-3 py-2">{p.blade ?? "—"}</td>
                    <td className="px-3 py-2">{p.face ?? "—"}</td>
                    <td className="tabular px-3 py-2">{fmt(f.radius_m, "m")}</td>
                    <td className="tabular px-3 py-2">{fmt(f.length_mm, "mm")}</td>
                    <td className="tabular px-3 py-2">{fmt(f.width_mm, "mm")}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[f.status]}</td>
                    <td className="px-3 py-2">
                      {href ? (
                        <Link href={href} className="font-mono text-2xs underline">
                          {p.file ?? "Abrir"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
