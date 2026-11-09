import Link from "next/link";
import type { Dictionary } from "@/i18n";
import type { ServiceSpec } from "@/contracts/platform";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal, RevealItem } from "@/components/ui/Reveal";

function ServiceIcon({ id }: { id: ServiceSpec["id"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "dji_apps") {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <rect x={6} y={12} width={28} height={17} rx={2} {...common} />
        <rect x={11} y={15} width={18} height={11} rx={1} {...common} stroke="hsl(var(--accent-primary))" />
        <path d="M11 12V5M29 12V5" {...common} />
        <circle cx={8.5} cy={20.5} r={1} fill="currentColor" />
        <circle cx={31.5} cy={20.5} r={1} fill="currentColor" />
      </svg>
    );
  }
  if (id === "platforms") {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <rect x={5} y={8} width={30} height={24} rx={2} {...common} />
        <path d="M5 13h30M13 13v19" {...common} />
        <path d="M17 27l4-5 3 3 5-7" {...common} stroke="hsl(var(--accent-primary))" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      <circle cx={20} cy={20} r={14} {...common} />
      <path d="M6 20h28M20 6c4 4 6 9 6 14s-2 10-6 14c-4-4-6-9-6-14s2-10 6-14z" {...common} />
      <circle cx={20} cy={20} r={2.5} {...common} stroke="hsl(var(--accent-primary))" />
    </svg>
  );
}

export function Services({ t }: { t: Dictionary }) {
  const SERVICES = t.services.items;
  return (
    <section id="servicios" className="scroll-mt-20 border-t border-border-subtle py-24 md:py-32">
      <div className="container">
        <SectionHeader
          index="01"
          eyebrow={t.services.eyebrow}
          title={t.services.title}
          lede={t.services.lede}
        />

        <Reveal className="mt-14 grid gap-4 lg:grid-cols-3" stagger={0.08}>
          {SERVICES.map((s) => (
            <RevealItem key={s.id} className="h-full">
              <Link
                href={s.href}
                className="panel group flex h-full flex-col p-7 transition-[border-color,background-color,transform] duration-spring-gimbal ease-spring-gimbal hover:-translate-y-1 hover:border-accent-primary/50 hover:bg-surface-raised md:p-8"
              >
                <div className="flex items-start justify-between">
                  <span className="text-foreground-muted transition-colors group-hover:text-foreground">
                    <ServiceIcon id={s.id} />
                  </span>
                  <span className="font-mono text-2xs tabular text-accent-primary">{s.index}</span>
                </div>
                <h3 className="mt-8 text-xl font-medium">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{s.summary}</p>
                <ul className="mt-6 space-y-2.5 border-t border-border-subtle pt-6">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm">
                      <span className="mt-[7px] h-1 w-1 shrink-0 bg-accent-primary" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <span className="mt-auto flex items-center gap-2 pt-8 text-sm text-foreground-muted transition-colors group-hover:text-foreground">
                  {s.cta}
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-spring-actuator ease-spring-actuator group-hover:translate-x-1" aria-hidden>
                    <path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" fill="none" />
                  </svg>
                </span>
              </Link>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
