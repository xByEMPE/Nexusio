import { HERO } from "@/content/site";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { FlightHud } from "@/components/hud/FlightHud";

export function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden pb-16 pt-24 sm:pb-20 sm:pt-28 md:pb-28 md:pt-36" aria-labelledby="hero-title">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-hud-grid bg-grid-64 opacity-40 [mask-image:radial-gradient(ellipse_at_60%_30%,black_10%,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[640px] w-[640px] rounded-full bg-accent-halo opacity-70"
      />

      <div className="container relative grid items-start gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5 lg:pt-6">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.35em] text-foreground-muted">{HERO.eyebrow}</p>
            <div className="mt-3 h-px w-24 bg-accent-muted" aria-hidden />
          </div>
          <div>
            <h1 id="hero-title" className="mt-8 text-balance text-[2rem] font-medium leading-[1.08] tracking-[-0.025em] sm:text-display-sm md:text-display-md">
              {HERO.title}
            </h1>
          </div>
          <div>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-foreground-muted md:text-lg">{HERO.lede}</p>
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href={HERO.primaryCta.href} arrow>
              {HERO.primaryCta.label}
            </ButtonLink>
            <ButtonLink href={HERO.secondaryCta.href} variant="secondary">
              {HERO.secondaryCta.label}
            </ButtonLink>
          </div>
        </div>

        <Reveal className="lg:col-span-7" delay={0.15}>
          <RevealItem>
            <FlightHud />
            <p className="mt-3 font-mono text-2xs text-foreground-subtle">
              Vista de ejemplo de una app de vuelo · datos simulados de una ruta de mapeo automática
            </p>
          </RevealItem>
        </Reveal>
      </div>

      <div className="container relative mt-20">
        <Reveal className="grid border-y border-border-subtle sm:grid-cols-2 lg:grid-cols-4" stagger={0.05}>
          {HERO.values.map((v, i) => (
            <RevealItem
              key={v.title}
              className={`px-4 py-7 md:px-6 ${i > 0 ? "max-sm:border-t sm:border-l border-border-subtle" : ""} ${i === 2 ? "sm:max-lg:border-l-0 sm:max-lg:border-t" : ""} ${i === 3 ? "sm:max-lg:border-t" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-2xs tabular text-accent-primary">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium">{v.title}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{v.body}</p>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
