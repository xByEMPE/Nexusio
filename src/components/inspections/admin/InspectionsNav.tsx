"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin/inspecciones/organizaciones", label: "Organizaciones" },
  { href: "/admin/inspecciones/usuarios", label: "Usuarios" },
  { href: "/admin/inspecciones/sitios", label: "Sitios" },
  { href: "/admin/inspecciones/proyectos", label: "Proyectos" },
];

export function InspectionsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Inspecciones" className="border-b border-border-subtle bg-surface-layer">
      <ul className="flex gap-1 overflow-x-auto px-4 py-2 md:px-6">
        {ITEMS.map((i) => {
          const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-[2px] px-3 py-1.5 text-xs transition-colors",
                  active ? "bg-accent-deep text-foreground" : "text-foreground-muted hover:text-foreground",
                )}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
