import { redirect } from "next/navigation";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdminEmail } from "@/lib/admin-auth";
import { createSessionClient } from "@/services/supabase/server";

const ERRORS: Record<string, string> = {
  forbidden: "Esta cuenta no tiene acceso al panel.",
  config: "El panel no está configurado: faltan las variables de Supabase.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  // Si ya hay sesión de administrador, directo al panel.
  const sb = await createSessionClient();
  const user = sb ? (await sb.auth.getUser()).data.user : null;
  if (user && isAdminEmail(user.email)) redirect("/admin");

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <NexusMark className="h-9 w-9" animated={false} spinning={false} />
          <Wordmark className="text-xl" />
        </div>
        <div className="panel p-6 sm:p-8">
          <h1 className="text-xl font-medium">Panel de solicitudes</h1>
          <p className="mt-1 text-sm text-foreground-muted">Acceso solo para el equipo de NEXUS.</p>
          {error && ERRORS[error] && (
            <p role="alert" className="mt-4 rounded-[2px] border border-signal-critical/40 px-3 py-2 text-sm text-signal-critical">
              {ERRORS[error]}
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
