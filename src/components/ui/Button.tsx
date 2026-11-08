import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "group relative inline-flex select-none items-center justify-center gap-2 rounded-[2px] px-5 py-3 text-sm font-medium " +
  "transition-[transform,background-color,border-color,color] duration-spring-actuator ease-spring-actuator " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-accent-primary text-on-accent hover:bg-telemetry-active hover:text-background-base",
  secondary:
    "border border-border-strong bg-transparent text-foreground hover:border-foreground/70 hover:bg-surface-raised",
  ghost: "px-3 text-foreground-muted hover:text-foreground",
};

function Arrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 transition-transform duration-spring-actuator ease-spring-actuator group-hover:translate-x-1"
    >
      <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

interface CommonProps {
  readonly variant?: Variant;
  readonly arrow?: boolean;
  readonly children: ReactNode;
}

export function ButtonLink({
  variant = "primary",
  arrow = false,
  className,
  children,
  ...props
}: CommonProps & ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], className)} {...props}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}

export function Button({
  variant = "primary",
  arrow = false,
  className,
  children,
  type = "button",
  ...props
}: CommonProps & ComponentPropsWithoutRef<"button">) {
  return (
    <button type={type} className={cn(base, variants[variant], className)} {...props}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}
