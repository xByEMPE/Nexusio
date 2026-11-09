import Image from "next/image";
import type { Dictionary } from "@/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { ControllerVideo } from "@/components/showcase/ControllerVideo";

export function AppShowcase({ t }: { t: Dictionary }) {
  const APP_EXAMPLE = t.apps.example;
  return (
    <section id="apps" className="relative scroll-mt-20 overflow-hidden border-t border-border-subtle py-24 md:py-32">
      <div className="container">
        <SectionHeader
          index="02"
          eyebrow={t.apps.eyebrow}
          title={t.apps.title}
          lede={t.apps.lede}
        />

        <div className="mt-14 grid items-center gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <RevealItem>
              <ControllerVideo
                src="/media/app-inspeccion-aspas.webm"
                fallbackSrc="/media/app-inspeccion-aspas.mp4"
                poster="/media/app-inspeccion-aspas-poster.webp"
                label={t.apps.videoLabel}
              />
            </RevealItem>
          </Reveal>

          <Reveal className="lg:col-span-5" stagger={0.07}>
            <RevealItem>
              <div className="label-caps text-accent-primary">{APP_EXAMPLE.eyebrow}</div>
              <h3 className="mt-3 text-2xl font-medium md:text-3xl">{APP_EXAMPLE.title}</h3>
              <p className="mt-4 leading-relaxed text-foreground-muted">{APP_EXAMPLE.lede}</p>
            </RevealItem>

            <RevealItem>
              <ol className="mt-8 grid grid-cols-2 gap-1.5 sm:grid-cols-4" aria-label={t.apps.sequenceAria}>
                {APP_EXAMPLE.steps.map((s, i) => (
                  <li key={s.code} className="panel px-2.5 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-foreground">{s.code}</span>
                      <span className="font-mono text-2xs tabular text-foreground-subtle">{i + 1}</span>
                    </div>
                    <div className="mt-1.5 text-xs leading-snug text-foreground-muted">{s.label}</div>
                  </li>
                ))}
              </ol>
            </RevealItem>

            <RevealItem>
              <ul className="mt-8 space-y-5">
                {APP_EXAMPLE.features.map((f) => (
                  <li key={f.title} className="grid grid-cols-[12px_1fr] gap-3">
                    <span className="mt-[9px] h-1 w-1 bg-accent-primary" aria-hidden />
                    <div>
                      <h4 className="font-medium">{f.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-foreground-muted">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </RevealItem>
          </Reveal>
        </div>

        <Reveal className="mt-24">
          <RevealItem>
            <div id="compatibilidad" className="panel relative scroll-mt-20 overflow-hidden">
              <div className="relative aspect-[1600/889] w-full bg-black lg:aspect-[3584/1280]">
                {/* Teléfono y tablet: recorte ajustado a los dos drones, sin perder contenido */}
                <Image
                  src="/images/matrice-4-series-mobile.webp"
                  alt={t.apps.dronesAlt}
                  fill
                  sizes="(min-width: 1024px) 1px, 100vw"
                  unoptimized
                  className="object-cover object-center lg:hidden"
                />
                {/* Escritorio: panorámica completa (3584 px, WebP q92, sin reprocesar) */}
                <Image
                  src="/images/matrice-4-series.webp"
                  alt=""
                  aria-hidden
                  fill
                  sizes="(min-width: 1360px) 1300px, 100vw"
                  unoptimized
                  className="hidden object-cover object-center lg:block"
                />
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 hidden h-1/3 bg-gradient-to-t from-surface-layer to-transparent dark:block"
                />
              </div>
              <div className="grid gap-8 border-t border-border-subtle p-7 md:p-10 lg:grid-cols-12">
                <CompatibilityBody c={t.apps.compatibility} />
              </div>
            </div>
          </RevealItem>
        </Reveal>
      </div>
    </section>
  );
}

function CompatibilityBody({ c: COMPATIBILITY }: { c: Dictionary["apps"]["compatibility"] }) {
  return (
    <>
      <div className="lg:col-span-6">
        <h3 className="text-2xl font-medium">{COMPATIBILITY.title}</h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground-muted">{COMPATIBILITY.body}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:col-span-6">
        <div>
          <div className="label-caps mb-3">{COMPATIBILITY.dronesLabel}</div>
          <ul className="space-y-1.5 text-sm">
            {COMPATIBILITY.aircraft.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label-caps mb-3">{COMPATIBILITY.controllersLabel}</div>
          <ul className="space-y-1.5 text-sm">
            {COMPATIBILITY.controllers.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
