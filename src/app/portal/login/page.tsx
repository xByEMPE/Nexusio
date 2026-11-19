import { redirect } from "next/navigation";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdminEmail } from "@/lib/admin-auth";
import { getViewer, homePathFor } from "@/lib/auth/viewer";
import { assertInspectionsEnabled, inspectionsEnabled } from "@/lib/inspections/flag";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso" };

const ERRORS: Record<string, string> = {
  forbidden: "Esta cuenta no tiene acceso al portal.",
  invite: "El enlace de invitación no es válido o venció. Pide uno nuevo.",
  recovery: "El enlace de recuperación no es válido o venció. Solicita uno nuevo con «¿Olvidaste tu contraseña?».",
  config: "El portal no está configurado: faltan las variables de Supabase.",
};

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  assertInspectionsEnabled();
  const { error } = await searchParams;

  // Si ya hay sesión con acceso, directo a su destino (salvo ?error=forbidden: evita bucles).
  const viewer = await getViewer();
  if (viewer && error !== "forbidden") {
    const path = homePathFor({ ...viewer, isAdminEmail: isAdminEmail(viewer.user.email) }, inspectionsEnabled());
    if (path) redirect(path);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <NexusMark className="h-9 w-9" animated={false} spinning={false} />
          <Wordmark className="text-xl" />
        </div>
        <div className="panel p-6 sm:p-8">
          <h1 className="text-xl font-medium">Portal de clientes</h1>
          <p className="mt-1 text-sm text-foreground-muted">Consulta tus proyectos e inspecciones.</p>
          {error && ERRORS[error] && (
            <p role="alert" className="mt-4 rounded-[2px] border border-signal-critical/40 px-3 py-2 text-sm text-signal-critical">
              {ERRORS[error]}
            </p>
          )}
          <LoginForm area="portal" />
        </div>
      </div>
    </main>
  );
}
