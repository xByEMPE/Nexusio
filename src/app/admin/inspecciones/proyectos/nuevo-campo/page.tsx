import Link from "next/link";
import { FieldProjectForm } from "@/components/inspections/admin/FieldProjectForm";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";
import { createFieldProject } from "../../actions/field-projects";

export const metadata = { title: "Nuevo proyecto de campo" };

export default async function NewFieldProjectPage() {
  assertInspectionsEnabled();
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = isAdmin ? await createSessionClient() : null;
  const [orgs, sites] = sb
    ? await Promise.all([
        sb.from("organizations").select("id, name").order("name"),
        sb.from("sites").select("id, name, organization_id").eq("kind", "wind_farm").order("name"),
      ])
    : [null, null];
  const failed = isAdmin && (!sb || orgs?.error || sites?.error);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/inspecciones/proyectos" className="text-xs text-foreground-muted hover:text-foreground">
        ← Proyectos
      </Link>
      <h1 className="mt-2 text-2xl font-medium">Nuevo proyecto de campo</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Crea en un solo paso el cliente, el parque, sus turbinas, el proyecto y la asignación del técnico: al iniciar
        sesión en la app verá su proyecto con la lista de máquinas.
      </p>
      {!isAdmin && <div className="panel mt-6 p-6 text-sm text-foreground-muted">Solo un administrador puede crear proyectos de campo.</div>}
      {failed && <p className="mt-4 text-sm text-signal-critical">No fue posible cargar las organizaciones y los parques.</p>}
      {isAdmin && !failed && (
        <div className="mt-6">
          <FieldProjectForm orgs={orgs?.data ?? []} sites={sites?.data ?? []} action={createFieldProject} />
        </div>
      )}
    </div>
  );
}
