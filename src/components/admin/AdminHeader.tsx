import Link from "next/link";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { signOut } from "@/app/admin/actions";

export function AdminHeader({ email }: { email: string | undefined }) {
  return (
    <header className="border-b border-border-subtle bg-surface-layer">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/admin" className="flex items-center gap-3">
          <NexusMark className="h-7 w-7" animated={false} spinning={false} />
          <Wordmark className="hidden text-lg sm:inline" />
          <span className="font-mono text-2xs uppercase tracking-label text-foreground-subtle">Panel</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-foreground-subtle md:inline">{email}</span>
          <ThemeToggle />
          <form action={signOut}>
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

export function StatusBadge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-2xs ${cls}`}>{label}</span>;
}
