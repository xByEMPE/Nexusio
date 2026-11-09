import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { ClientPortalPreview } from "@/components/portal/ClientPortalPreview";
import type { Dictionary } from "@/i18n";



export function ClientPortal({ t: dict }: { t: Dictionary }) {
  const t = dict.portal;
  const HIGHLIGHTS = t.highlights;
  return (
    <section id="portal" className="relative scroll-mt-20 overflow-hidden border-t border-border-subtle py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute right-0 top-40 h-[520px] w-[520px] rounded-full bg-accent-halo opacity-50" />
      <div className="container relative">
        <SectionHeader
          index="03"
          eyebrow={t.eyebrow}
          title={t.title}
          lede={t.lede}
        />

        <Reveal className="mt-14">
          <RevealItem>
            <ClientPortalPreview />
          </RevealItem>
        </Reveal>

        <Reveal className="mt-12 grid gap-8 md:grid-cols-3" stagger={0.07}>
          {HIGHLIGHTS.map((h, i) => (
            <RevealItem key={h.title} className="grid grid-cols-[32px_1fr] gap-3">
              <span className="font-mono text-2xs tabular text-accent-primary">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="font-medium">{h.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">{h.body}</p>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
