import Link from "next/link";
import { cn } from "@/lib/cn";

export type GridCapture = {
  id: string;
  blade: "A" | "B" | "C";
  face: "TE" | "PS" | "LE" | "SS";
  fileName: string;
  thumbUrl?: string;
};

const BLADES = ["A", "B", "C"] as const;
const FACES = ["TE", "PS", "LE", "SS"] as const;
const FACE_LABEL = { TE: "Borde de salida (TE)", PS: "Lado de presión (PS)", LE: "Borde de ataque (LE)", SS: "Lado de succión (SS)" } as const;

/** Miniaturas firmadas agrupadas por pala (A/B/C) y cara (TE/PS/LE/SS). */
export function CaptureGrid({ captures, viewerBase }: { captures: GridCapture[]; viewerBase?: string }) {
  if (captures.length === 0) {
    return (
      <div className="panel p-10 text-center text-sm text-foreground-muted">
        Esta inspección aún no tiene fotos. Aparecerán aquí cuando se suban desde la app de PC.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {BLADES.map((blade) => {
        const ofBlade = captures.filter((c) => c.blade === blade);
        if (ofBlade.length === 0) return null;
        return (
          <section key={blade} aria-label={`Pala ${blade}`} className="panel p-5">
            <h3 className="font-medium">
              Pala {blade} <span className="tabular text-xs text-foreground-muted">· {ofBlade.length} fotos</span>
            </h3>
            <div className="mt-4 flex flex-col gap-5">
              {FACES.map((face) => {
                const items = ofBlade.filter((c) => c.face === face);
                if (items.length === 0) return null;
                return (
                  <div key={face}>
                    <h4 className="label-caps">
                      {FACE_LABEL[face]} <span className="tabular text-foreground-subtle">· {items.length}</span>
                    </h4>
                    <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {items.map((c) => (
                        <li key={c.id} className="overflow-hidden rounded-[2px] border border-border-subtle bg-background-base">
                          {(() => {
                            const body = (
                              <>
                                {c.thumbUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- ruta /api/media del portal (sesión + caché)
                                  <img src={c.thumbUrl} alt={c.fileName} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
                                ) : (
                                  <div className={cn("flex aspect-[4/3] items-center justify-center px-2 text-center text-2xs text-foreground-subtle")}>
                                    Sin miniatura
                                  </div>
                                )}
                                <div className="truncate px-2 py-1 font-mono text-2xs text-foreground-muted">{c.fileName}</div>
                              </>
                            );
                            return viewerBase ? (
                              <Link href={`${viewerBase}?foto=${c.id}`} className="block hover:opacity-90">
                                {body}
                              </Link>
                            ) : (
                              body
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
