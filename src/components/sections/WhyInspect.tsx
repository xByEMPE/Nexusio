import type { Dictionary } from "@/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { WhyInspectTabs } from "@/components/sections/WhyInspectTabs";

/** «¿Por qué inspeccionar a tiempo?»: tres activos, cada uno con su figura interactiva. */
export function WhyInspect({ t }: { t: Dictionary }) {
  const w = t.whyInspect;
  return (
    <section id="por-que-inspeccionar" className="scroll-mt-20 border-t border-border-subtle py-24 md:py-32">
      <div className="container">
        <SectionHeader index="02" eyebrow={w.eyebrow} title={w.title} lede={w.lede} />
        <WhyInspectTabs
          locale={t.meta.locale === "en" ? "en" : "es"}
          tablistAria={w.tablistAria}
          loading={w.loading}
          tabs={w.tabs}
        />
      </div>
    </section>
  );
}
