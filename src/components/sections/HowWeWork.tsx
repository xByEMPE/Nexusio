"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from "motion/react";
import { DATA_CARE, HOSTING, PROCESS, ROLE_MATRIX } from "@/content/site";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { spring } from "@/lib/motion";
import { springs } from "@/lib/motion-tokens";

/** Pasos del proyecto con una línea de avance ligada al scroll. */
function ProcessTimeline() {
  const ref = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const progress = useSpring(scrollYProgress, springs.telemetry);
  const [active, setActive] = useState(reduced ? PROCESS.length - 1 : -1);

  useMotionValueEvent(progress, "change", (v) => {
    if (reduced) return;
    setActive(Math.min(PROCESS.length - 1, Math.floor(v * PROCESS.length + 0.15)));
  });

  return (
    <ol ref={ref} className="relative grid gap-4 md:grid-cols-4">
      <div className="absolute left-[11px] top-0 h-full w-px bg-border-subtle md:left-0 md:top-[11px] md:h-px md:w-full" aria-hidden />
      <motion.div
        className="absolute left-[11px] top-0 h-full w-px origin-top bg-accent-primary md:hidden"
        style={{ scaleY: reduced ? 1 : progress }}
        aria-hidden
      />
      <motion.div
        className="absolute left-0 top-[11px] hidden h-px w-full origin-left bg-accent-primary md:block"
        style={{ scaleX: reduced ? 1 : progress }}
        aria-hidden
      />
      {PROCESS.map((step, i) => {
        const on = i <= active;
        return (
          <li key={step.index} className="relative pl-10 md:pl-0 md:pt-10">
            <motion.span
              className="absolute left-0 top-0 grid h-[23px] w-[23px] place-items-center rounded-full border bg-background-base"
              animate={{
                borderColor: on ? "hsl(var(--accent-primary))" : "hsl(var(--border-strong))",
                scale: i === active ? 1.15 : 1,
              }}
              transition={spring("actuator")}
              aria-hidden
            >
              <motion.span className="h-2 w-2 rounded-full bg-accent-primary" animate={{ opacity: on ? 1 : 0 }} transition={spring("actuator")} />
            </motion.span>
            <span className="font-mono text-2xs tabular text-accent-primary">{step.index}</span>
            <h3 className="mt-2 text-lg font-medium">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{step.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function HowWeWork() {
  return (
    <section id="proceso" className="scroll-mt-20 border-t border-border-subtle py-24 md:py-32">
      <div className="container">
        <SectionHeader
          index="05"
          eyebrow="Cómo trabajamos"
          title="De la primera conversación a la app instalada en sus controles."
          lede="Un proceso por etapas, con entregas que puede revisar y probar antes de pasar a la siguiente."
        />

        <div className="mt-16">
          <ProcessTimeline />
        </div>

        <Reveal className="mt-24 grid gap-12 lg:grid-cols-12">
          <RevealItem className="lg:col-span-5">
            <h3 className="text-2xl font-medium">Sus datos, bajo su control</h3>
            <div className="mt-8 space-y-6">
              {DATA_CARE.map((d, i) => (
                <div key={d.title} className="grid grid-cols-[32px_1fr] gap-3">
                  <span className="font-mono text-2xs tabular text-accent-primary">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="font-medium">{d.title}</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">{d.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mt-14 text-xl font-medium">¿Dónde se aloja la plataforma?</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {HOSTING.map((h) => (
                <div key={h.id} className="panel p-5">
                  <div className="font-medium">{h.name}</div>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{h.body}</p>
                </div>
              ))}
            </div>
          </RevealItem>

          <RevealItem className="lg:col-span-7">
            <h3 className="text-2xl font-medium">Cada persona ve lo que le corresponde</h3>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground-muted">
              Los permisos se definen por rol. Un piloto puede subir sus fotos sin ver los reportes en borrador, y un cliente
              puede consultar sus reportes sin acceder a los de otros.
            </p>
            {/* Móvil: cada acción con los roles que la pueden realizar */}
            <ul className="panel mt-6 divide-y divide-border-subtle sm:hidden">
              {ROLE_MATRIX.permissions.map((p) => (
                <li key={p.label} className="px-4 py-3.5">
                  <div className="text-sm text-foreground-muted">{p.label}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ROLE_MATRIX.roles.map((r, i) =>
                      p.grants[i] ? (
                        <span key={r} className="rounded-[2px] border border-accent-primary/50 bg-accent-deep px-2 py-0.5 text-2xs">
                          {r}
                        </span>
                      ) : null,
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="panel mt-6 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <caption className="sr-only">Permisos por rol</caption>
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th scope="col" className="px-4 py-3 text-left text-xs font-normal text-foreground-subtle">
                      Acción
                    </th>
                    {ROLE_MATRIX.roles.map((r) => (
                      <th key={r} scope="col" className="px-3 py-3 text-center text-xs font-normal text-foreground-subtle">
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROLE_MATRIX.permissions.map((p) => (
                    <tr key={p.label} className="border-b border-border-subtle last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-normal text-foreground-muted">
                        {p.label}
                      </th>
                      {p.grants.map((g, i) => (
                        <td key={i} className="px-3 py-3 text-center">
                          {g ? (
                            <span className="inline-block h-2 w-2 bg-accent-primary" aria-label="Sí" />
                          ) : (
                            <span className="inline-block h-px w-2 bg-border-strong align-middle" aria-label="No" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RevealItem>
        </Reveal>
      </div>
    </section>
  );
}
