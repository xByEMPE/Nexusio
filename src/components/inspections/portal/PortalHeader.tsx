import Link from "next/link";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { portalSignOut } from "@/app/portal/actions";

export function PortalHeader({ email }: { email: string | undefined }) {
  return (
    <header className="border-b border-border-subtle bg-surface-layer">
      <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/portal" className="flex items-center gap-3">
          <NexusMark className="h-7 w-7" animated={false} spinning={false} />
          <Wordmark className="hidden text-lg sm:inline" />
          <span className="font-mono text-2xs uppercase tracking-label text-foreground-subtle">Portal de clientes</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-foreground-subtle md:inline">{email}</span>
          <ThemeToggle />
          <form action={portalSignOut}>
            <button
              type="submit"
              className="h-9 rounded-[2px] border border-border-subtle px-3 text-xs text-foreground-muted hover:border-foreground/40 hover:text-foreground"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
