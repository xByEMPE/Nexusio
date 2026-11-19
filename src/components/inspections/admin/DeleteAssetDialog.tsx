"use client";

import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteAsset } from "@/app/admin/inspecciones/actions/catalog";
import { Button } from "@/components/ui/Button";

const FIELD =
  "w-full rounded-[2px] border border-border-strong bg-background-base px-3.5 py-3 text-sm text-foreground focus:border-signal-critical focus:outline-none focus:ring-1 focus:ring-signal-critical/50";

/** Eliminar un activo sin inspecciones: confirmación escribiendo su nombre. */
export function DeleteAssetDialog({ assetId, name }: { assetId: string; name: string }) {
  const router = useRouter();
  const titleId = useId();
  const inputId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    openerRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex=\"-1\"])");
    const first = nodes?.[0];
    const last = nodes?.[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const run = () =>
    startBusy(async () => {
      setError(null);
      const r = await deleteAsset(assetId, confirm).catch(() => null);
      if (!r) setError("No se pudo eliminar el activo. Inténtalo de nuevo.");
      else if (!r.ok) setError(r.message);
      else {
        setOpen(false);
        openerRef.current?.focus();
        router.refresh();
      }
    });

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-1.5 text-xs text-signal-critical"
        onClick={(e) => {
          openerRef.current = e.currentTarget;
          setConfirm("");
          setError(null);
          setOpen(true);
        }}
      >
        Eliminar activo
      </Button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="panel w-full max-w-md bg-surface-layer p-6 focus:outline-none"
          >
            <h2 id={titleId} className="text-lg font-medium">
              Eliminar activo
            </h2>
            <p className="mt-2 text-sm text-foreground-muted">
              Se eliminará «{name}» y sus especificaciones de forma definitiva. Solo es posible si no tiene inspecciones.
            </p>
            <label htmlFor={inputId} className="mt-5 flex flex-col gap-2">
              <span className="label-caps">Escribe «{name}» para confirmar</span>
              <input
                id={inputId}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className={FIELD}
              />
            </label>
            {error && (
              <p role="alert" className="mt-4 text-sm text-signal-critical">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={close} disabled={busy}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy || confirm.trim() !== name}
                onClick={run}
                className="!bg-signal-critical !text-background-base"
              >
                {busy ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
