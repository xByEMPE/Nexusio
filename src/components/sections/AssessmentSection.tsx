import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { AssessmentForm } from "@/components/assessment/AssessmentForm";

const NEXT_STEPS = [
  { k: "1", v: "Revisamos su información y le escribimos para coordinar una llamada." },
  { k: "2", v: "Conversamos sobre su operación y aclaramos lo que necesita." },
  { k: "3", v: "Le enviamos una propuesta con alcance, etapas, plazos y costo." },
];

export function AssessmentSection() {
  return (
    <section id="evaluacion" className="relative scroll-mt-20 overflow-hidden border-t border-border-subtle py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute -left-40 bottom-0 h-[520px] w-[520px] rounded-full bg-accent-halo opacity-60" />
      <div className="container relative">
        <SectionHeader
          index="06"
          eyebrow="Evaluación sin costo"
          title="Cuéntenos qué quiere lograr con sus drones."
          lede="Cuatro pasos breves. Con esta información preparamos una propuesta pensada para su operación, no una cotización genérica."
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <RevealItem>
              <div className="label-caps mb-5">Qué pasa después</div>
              <ol className="divide-y divide-border-subtle border-y border-border-subtle">
                {NEXT_STEPS.map((p) => (
                  <li key={p.k} className="grid grid-cols-[32px_1fr] gap-3 py-4">
                    <span className="font-mono text-xs text-accent-primary">0{p.k}</span>
                    <span className="text-sm leading-relaxed text-foreground-muted">{p.v}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-sm leading-relaxed text-foreground-subtle">
                Si lo necesita, firmamos un acuerdo de confidencialidad antes de revisar los detalles de su operación. Sus datos
                se usan solo para responder a esta solicitud.
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
