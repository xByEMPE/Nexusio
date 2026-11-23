"use client";

import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteUser } from "@/app/admin/inspecciones/actions/users";
import { Button } from "@/components/ui/Button";

const FIELD =
  "w-full rounded-[2px] border border-border-strong bg-background-base px-3.5 py-3 text-sm text-foreground focus:border-signal-critical focus:outline-none focus:ring-1 focus:ring-signal-critical/50";

/** Eliminar un usuario por completo: confirmación escribiendo su correo. Diferente de «Quitar de la organización». */
export function DeleteUserDialog({ userId, email, name }: { userId: string; email: string; name: string }) {
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
      const fd = new FormData();
      fd.set("user_id", userId);
      fd.set("confirm_email", confirm);
      const r = await deleteUser(fd).catch(() => null);
      if (!r) setError("No se pudo eliminar al usuario. Inténtalo de nuevo.");
      else if (!r.ok) setError(r.message);
      else {
        setOpen(false);
        router.refresh();
      }
    });

  const matches = confirm.trim().toLowerCase() === email.trim().toLowerCase();

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
        Eliminar usuario
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
              Eliminar usuario
            </h2>
            <p className="mt-2 text-sm text-foreground-muted">
              Se eliminará la cuenta de {name} por completo: su acceso, su perfil, sus membresías, sus asignaciones a proyectos y los
              comentarios que escribió. Los daños, fotos e inspecciones que creó se conservan sin autor, y su historial de cambios queda
              como «Usuario eliminado». El correo quedará libre para invitarlo de nuevo. No se puede deshacer.
            </p>
            <p className="mt-2 text-xs text-foreground-subtle">Para quitarlo solo de una organización, usa «Quitar de la organización».</p>
            <label htmlFor={inputId} className="mt-5 flex flex-col gap-2">
              <span className="label-caps">Escribe «{email}» para confirmar</span>
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
              <Button type="button" variant="primary" disabled={busy || !matches} onClick={run} className="!bg-signal-critical !text-background-base">
                {busy ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
