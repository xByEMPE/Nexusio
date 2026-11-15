import { redirect } from "next/navigation";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  assertInspectionsEnabled();
  const sb = await createSessionClient();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (!user) redirect("/admin/login?error=invite");

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <NexusMark className="h-9 w-9" animated={false} spinning={false} />
          <Wordmark className="text-xl" />
        </div>
        <div className="panel p-6 sm:p-8">
          <h1 className="text-xl font-medium">Elige tu contraseña</h1>
          <p className="mt-1 text-sm text-foreground-muted">Tu invitación fue aceptada. Crea una contraseña para entrar.</p>
          <SetPasswordForm />
        </div>
      </div>
    </main>
  );
}
