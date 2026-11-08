"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

interface FieldProps {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
  readonly children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  readonly className?: string;
}

export function Field({ label, error, hint, children, className }: FieldProps) {
  const inputId = useId();
  const errId = `${inputId}-err`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={inputId} className="label-caps">
        {label}
      </label>
      {children({ inputId, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-foreground-subtle">
          {hint}
        </p>
      )}
      <ErrorText id={errId} message={error} />
    </div>
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          id={id}
          role="alert"
          className="font-mono text-2xs text-signal-critical"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={spring("actuator")}
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

const inputBase =
  "w-full rounded-[2px] border bg-background-base px-3.5 py-3 text-sm text-foreground placeholder:text-foreground-subtle " +
  "transition-[border-color,box-shadow] duration-spring-actuator ease-spring-actuator " +
  "focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/50";

export function TextInput({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(inputBase, invalid ? "border-signal-critical/70" : "border-border-strong", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function TextArea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(inputBase, "min-h-[120px] resize-y leading-relaxed", invalid ? "border-signal-critical/70" : "border-border-strong", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

interface ChoiceProps<T extends string> {
  readonly legend: string;
  readonly options: readonly { readonly value: T; readonly label: string; readonly hint?: string }[];
  readonly selected: readonly T[] | T | undefined;
  readonly onSelect: (value: T) => void;
  readonly multiple?: boolean;
  readonly error?: string;
  readonly columns?: 2 | 3 | 4;
}

/** Grupo de opciones con semántica de checkbox (múltiple) o radio (única). */
export function ChoiceGroup<T extends string>({
  legend,
  options,
  selected,
  onSelect,
  multiple = false,
  error,
  columns = 2,
}: ChoiceProps<T>) {
  const errId = useId();
  const isOn = (v: T) => (Array.isArray(selected) ? selected.includes(v) : selected === v);
  return (
    <fieldset aria-describedby={error ? errId : undefined} className="flex flex-col gap-2">
      <legend className="label-caps mb-2">
        {legend}
        {multiple && <span className="ml-2 normal-case tracking-normal text-foreground-subtle">(múltiple)</span>}
      </legend>
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
          columns === 4 && "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {options.map((o) => {
          const on = isOn(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex cursor-pointer items-start gap-3 rounded-[2px] border px-3.5 py-3",
                "transition-[border-color,background-color] duration-spring-actuator ease-spring-actuator",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-primary",
                on ? "border-accent-primary/70 bg-accent-deep/60" : "border-border-strong hover:border-foreground/40",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                className="sr-only"
                checked={on}
                onChange={() => onSelect(o.value)}
                name={multiple ? undefined : legend}
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center border",
                  multiple ? "rounded-[1px]" : "rounded-full",
                  on ? "border-accent-primary" : "border-foreground-subtle",
                )}
              >
                <motion.span
                  className={cn("h-1.5 w-1.5 bg-accent-primary", multiple ? "rounded-[1px]" : "rounded-full")}
                  initial={false}
                  animate={{ scale: on ? 1 : 0 }}
                  transition={spring("actuator")}
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="hyphens-auto break-words text-sm leading-tight">{o.label}</span>
                {o.hint && <span className="mt-0.5 text-xs text-foreground-subtle">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <ErrorText id={errId} message={error} />
    </fieldset>
  );
}
