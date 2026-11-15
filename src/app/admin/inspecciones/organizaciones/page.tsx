import Link from "next/link";
import { TextInput } from "@/components/assessment/fields";
import { ActionForm } from "@/components/inspections/admin/ActionForm";
import { requireStaff } from "@/lib/auth/viewer";
import { createSessionClient } from "@/services/supabase/server";
import { createOrganization } from "../actions/organizations";

const plural = (n: number) => `${n} ${n === 1 ? "proyecto" : "proyectos"}`;

export const metadata = { title: "Organizaciones" };

export default async function OrganizationsPage() {
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();
  const { data, error } = sb
    ? await sb.from("organizations").select("id, name, slug, projects(count)").order("name")
    : { data: null, error: { message: "sin cliente" } };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="text-2xl font-medium">Organizaciones</h1>
        {error && <p className="mt-4 text-sm text-signal-critical">No fue posible cargar las organizaciones.</p>}
        {data && data.length === 0 && (
          <div className="panel mt-6 p-10 text-center text-sm text-foreground-muted">
            {isAdmin ? "Aún no hay organizaciones." : "Tu cuenta no administra organizaciones."}
          </div>
        )}
        {data && data.length > 0 && (
          <ul className="panel mt-6 divide-y divide-border-subtle">
            {data.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/inspecciones/organizaciones/${o.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{o.name}</div>
                    <div className="font-mono text-xs text-foreground-subtle">{o.slug}</div>
                  </div>
                  <span className="tabular whitespace-nowrap text-xs text-foreground-muted">
                    {plural(o.projects[0]?.count ?? 0)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <aside className="panel h-fit p-5">
          <h2 className="label-caps">Nueva organización</h2>
          <ActionForm action={createOrganization} submitLabel="Crear" successMessage="Organización creada." className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="label-caps">Nombre</span>
              <TextInput name="name" required minLength={2} maxLength={120} />
            </label>
            <label className="flex flex-col gap-2">
              <span className="label-caps">Identificador</span>
              <TextInput name="slug" required pattern="[a-z0-9\-]{2,60}" placeholder="cliente-c" />
              <span className="text-xs text-foreground-subtle">Minúsculas, números y guiones.</span>
            </label>
          </ActionForm>
        </aside>
      )}
    </div>
  );
}
