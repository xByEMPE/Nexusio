import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Reveal, RevealItem } from "./Reveal";

interface Props {
  readonly index: string;
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly lede?: ReactNode;
  readonly className?: string;
}

export function SectionHeader({ index, eyebrow, title, lede, className }: Props) {
  return (
    <Reveal className={cn("grid gap-6 md:grid-cols-12", className)}>
      <RevealItem className="md:col-span-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xs tabular text-accent-primary">{index}</span>
          <span className="h-px w-8 bg-accent-muted" aria-hidden />
          <span className="label-caps">{eyebrow}</span>
        </div>
      </RevealItem>
      <div className="md:col-span-9">
        <RevealItem>
          <h2 className="text-balance text-[1.75rem] font-medium leading-[1.12] tracking-[-0.02em] sm:text-display-sm md:text-display-md">{title}</h2>
        </RevealItem>
        {lede && (
          <RevealItem>
            <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-foreground-muted sm:mt-5 sm:text-base md:text-lg">{lede}</p>
          </RevealItem>
        )}
      </div>
    </Reveal>
  );
}
