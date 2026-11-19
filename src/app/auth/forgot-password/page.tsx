import Link from "next/link";
import { NexusMark, Wordmark } from "@/components/brand/NexusMark";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  assertInspectionsEnabled();
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <NexusMark className="h-9 w-9" animated={false} spinning={false} />
          <Wordmark className="text-xl" />
        </div>
        <div className="panel p-6 sm:p-8">
          <h1 className="text-xl font-medium">Recupera tu contraseña</h1>
          <p className="mt-1 text-sm text-foreground-muted">Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p>
          <ForgotPasswordForm />
          <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-muted">
            <Link href="/portal/login" className="text-accent-primary underline-offset-4 hover:underline">
              Acceso de clientes
            </Link>
            <Link href="/admin/login" className="text-accent-primary underline-offset-4 hover:underline">
              Acceso del equipo
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
