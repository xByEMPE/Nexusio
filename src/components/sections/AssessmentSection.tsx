import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { AssessmentForm } from "@/components/assessment/AssessmentForm";
import type { Dictionary } from "@/i18n";


export function AssessmentSection({ t: dict }: { t: Dictionary }) {
  const t = dict.assessment;
  const NEXT_STEPS = t.nextSteps;
  return (
    <section id="evaluacion" className="relative scroll-mt-20 overflow-hidden border-t border-border-subtle py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute -left-40 bottom-0 h-[520px] w-[520px] rounded-full bg-accent-halo opacity-60" />
      <div className="container relative">
        <SectionHeader
          index="06"
          eyebrow={t.eyebrow}
          title={t.title}
          lede={t.lede}
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <RevealItem>
              <div className="label-caps mb-5">{t.nextStepsTitle}</div>
              <ol className="divide-y divide-border-subtle border-y border-border-subtle">
                {NEXT_STEPS.map((p) => (
                  <li key={p.k} className="grid grid-cols-[32px_1fr] gap-3 py-4">
                    <span className="font-mono text-xs text-accent-primary">0{p.k}</span>
                    <span className="text-sm leading-relaxed text-foreground-muted">{p.v}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-sm leading-relaxed text-foreground-subtle">
                {t.privacyNote}
              </p>
            </RevealItem>
          </Reveal>
          <Reveal className="lg:col-span-8" delay={0.1}>
            <RevealItem>
              <AssessmentForm />
            </RevealItem>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
