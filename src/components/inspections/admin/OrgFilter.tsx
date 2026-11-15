import Link from "next/link";
import { cn } from "@/lib/cn";

/** Selector de organización por enlaces (`?org=<uuid>`), sin JavaScript de cliente. */
export function OrgFilter({
  basePath,
  orgs,
  selected,
  extra = {},
}: {
  basePath: string;
  orgs: { id: string; name: string }[];
  selected?: string;
  extra?: Record<string, string | undefined>;
}) {
  const href = (org?: string) => {
    const q = new URLSearchParams();
    if (org) q.set("org", org);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const item = (active: boolean) =>
    cn(
      "whitespace-nowrap rounded-[2px] border px-3 py-1.5 text-xs transition-colors",
      active ? "border-accent-primary bg-accent-deep text-foreground" : "border-border-subtle text-foreground-muted hover:text-foreground",
    );
  return (
    <nav aria-label="Organización" className="mt-4 flex flex-wrap gap-2">
      <Link href={href()} className={item(!selected)} aria-current={!selected ? "true" : undefined}>
        Todas
      </Link>
      {orgs.map((o) => (
        <Link key={o.id} href={href(o.id)} className={item(selected === o.id)} aria-current={selected === o.id ? "true" : undefined}>
          {o.name}
        </Link>
      ))}
    </nav>
  );
}
