import type { Dictionary } from "@/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { NexusMark } from "@/components/brand/NexusMark";
import { cn } from "@/lib/cn";

export function About({ t }: { t: Dictionary }) {
  const ABOUT = t.about;
  const { comparison } = ABOUT;

  return (
    <section id="nosotros" className="relative scroll-mt-20 overflow-hidden border-t border-border-subtle py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-32 h-[560px] w-[560px] rounded-full bg-accent-halo opacity-50" />
      <div className="container relative">
        <SectionHeader index="04" eyebrow={ABOUT.eyebrow} title={ABOUT.title} />

        <div className="mt-14 grid gap-12 lg:grid-cols-12">
          {/* Origen */}
          <Reveal className="lg:col-span-5" stagger={0.08}>
            {ABOUT.origin.map((p) => (
              <RevealItem key={p.slice(0, 24)}>
                <p className="mb-5 text-lg leading-relaxed text-foreground-muted">{p}</p>
              </RevealItem>
            ))}
            <RevealItem className="mt-10 hidden items-center gap-6 lg:flex">
              <NexusMark className="h-28 w-28 shrink-0" animated={false} />
              <div>
                <div className="font-display text-2xl uppercase tracking-wordmark">Nexus</div>
                <div className="mt-2 h-px w-32 bg-accent-muted" aria-hidden />
                <div className="mt-2 font-mono text-2xs uppercase tracking-[0.35em] text-foreground-muted">
                  Software · AI · Drones
                </div>
              </div>
            </RevealItem>
          </Reveal>

          {/* Objetivo, misión y visión */}
          <Reveal className="grid gap-3 lg:col-span-7" stagger={0.08}>
            {ABOUT.pillars.map((p, i) => {
              const isVision = p.id === "vision";
              return (
                <RevealItem key={p.id}>
                  <article
                    className={cn(
                      "panel grid gap-4 p-6 transition-colors duration-spring-gimbal ease-spring-gimbal hover:border-accent-primary/50 sm:grid-cols-[140px_1fr] md:p-7",
                      isVision && "border-accent-primary/40 bg-accent-deep/30",
                    )}
                  >
                    <header>
                      <span className="font-mono text-2xs tabular text-accent-primary">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="mt-1 text-xl font-medium">{p.label}</h3>
                    </header>
                    <div>
                      <p className="leading-relaxed text-foreground-muted">{p.body}</p>
                      {isVision && (
                        <div className="mt-5 flex items-center gap-3 font-mono text-2xs uppercase tracking-label" aria-hidden>
                          <span className="text-foreground">{ABOUT.visionFrom}</span>
                          <span className="relative h-px flex-1 max-w-40 bg-border-strong">
                            <span className="absolute inset-y-0 left-0 w-1/2 bg-accent-primary" />
                            <span className="absolute -top-[3px] left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-accent-primary" />
                          </span>
                          <span className="text-foreground-subtle">{ABOUT.visionTo}</span>
                        </div>
                      )}
                    </div>
                  </article>
                </RevealItem>
              );
            })}
          </Reveal>
        </div>

        {/* Comparación */}
        <Reveal className="mt-24">
          <RevealItem>
            <div className="grid gap-4 md:grid-cols-12 md:items-end">
              <h3 className="text-2xl font-medium md:col-span-5">{comparison.title}</h3>
              <p className="text-sm leading-relaxed text-foreground-muted md:col-span-7">{comparison.lede}</p>
            </div>
          </RevealItem>
          <RevealItem>
            <div className="panel mt-8 overflow-hidden">
              <div className="hidden grid-cols-[160px_1fr_1fr] border-b border-border-subtle md:grid">
                <div />
                {comparison.columns.map((c, i) => (
                  <div key={c} className={cn("px-6 py-4 text-xs", i === 1 ? "text-accent-primary" : "text-foreground-subtle")}>
                    {c}
                  </div>
                ))}
              </div>
              {comparison.rows.map((r) => (
                <div
                  key={r.aspect}
                  className="grid border-b border-border-subtle last:border-0 md:grid-cols-[160px_1fr_1fr]"
                >
                  <div className="px-5 pb-2 pt-5 font-medium md:px-6 md:py-6">{r.aspect}</div>
                  <div className="flex gap-3 px-5 py-2 text-sm leading-relaxed text-foreground-subtle md:px-6 md:py-6">
                    <span className="mt-[9px] h-px w-2.5 shrink-0 bg-border-strong" aria-hidden />
                    <span>
                      <span className="mb-1 block text-2xs uppercase tracking-label text-foreground-subtle md:sr-only">
                        {comparison.columns[0]}
                      </span>
                      {r.before}
                    </span>
                  </div>
                  <div className="flex gap-3 px-5 pb-5 pt-2 text-sm leading-relaxed md:border-l md:border-border-subtle md:bg-accent-deep/20 md:px-6 md:py-6">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-accent-primary" aria-hidden />
                    <span>
                      <span className="mb-1 block text-2xs uppercase tracking-label text-accent-primary md:sr-only">
                        {comparison.columns[1]}
                      </span>
                      {r.after}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </RevealItem>
        </Reveal>
      </div>
    </section>
  );
}
