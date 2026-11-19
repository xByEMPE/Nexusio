"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** `message` en el éxito (opcional) sustituye a `successMessage` cuando el texto depende del resultado. */
type Result = { ok: true; message?: string } | { ok: false; message: string };

/** Formulario que llama una acción de servidor y muestra el resultado en español. */
export function ActionForm({
  action,
  submitLabel,
  successMessage = "Listo.",
  variant = "primary",
  inline = false,
  className,
  children,
}: {
  action: (fd: FormData) => Promise<Result>;
  submitLabel: string;
  successMessage?: string;
  variant?: "primary" | "secondary" | "ghost";
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      let r: Result;
      try {
        r = await action(fd);
      } catch {
        r = { ok: false, message: "Ocurrió un error inesperado. Inténtalo de nuevo." };
      }
      setResult(r);
      if (r.ok) ref.current?.reset();
    });
  };

  return (
    <form ref={ref} onSubmit={onSubmit} className={className ?? (inline ? "inline-flex items-center gap-2" : "flex flex-col gap-4")}>
      {children}
      <div className={inline ? "inline-flex items-center gap-2" : "flex flex-wrap items-center gap-3"}>
        <Button type="submit" variant={variant} disabled={pending} className={inline ? "px-3 py-1.5 text-xs" : undefined}>
          {pending ? "Procesando…" : submitLabel}
        </Button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-xs text-foreground-muted" : "text-xs text-signal-critical"}>
            {result.ok ? (result.message ?? successMessage) : result.message}
          </p>
        )}
      </div>
    </form>
  );
}

/** Selector con el estilo de los campos del panel. */
export function SelectField({
  label,
  name,
  required,
  children,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-caps">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-[2px] border border-border-strong bg-background-base px-3.5 py-3 text-sm text-foreground focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50"
      >
        {children}
      </select>
    </label>
  );
}
