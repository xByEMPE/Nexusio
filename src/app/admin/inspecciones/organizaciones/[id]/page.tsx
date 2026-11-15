import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TextInput } from "@/components/assessment/fields";
import { ActionForm } from "@/components/inspections/admin/ActionForm";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";
import { renameOrganization } from "../../actions/organizations";
import { removeMembership } from "../../actions/users";

export const metadata = { title: "Organización" };

const ROLE_LABEL = { client_manager: "Gerente", client_viewer: "Lector" } as const;

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  assertInspectionsEnabled();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();
  if (!sb) notFound();

  const { data: org } = await sb.from("organizations").select("id, name, slug").eq("id", id).maybeSingle();
  if (!org) notFound();

  const [{ data: members }, { count: projectCount }] = await Promise.all([
    sb.from("organization_members").select("user_id, role, profiles(email, full_name, is_active)").eq("organization_id", id).order("created_at"),
    sb.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", id),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/inspecciones/organizaciones" className="text-xs text-foreground-muted hover:text-foreground">
        ← Organizaciones
      </Link>
      <h1 className="mt-3 text-2xl font-medium">{org.name}</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        <span className="font-mono">{org.slug}</span> · {projectCount ?? 0} {projectCount === 1 ? "proyecto" : "proyectos"}
      </p>

      {isAdmin && (
        <section className="panel mt-6 p-5">
          <h2 className="label-caps">Renombrar</h2>
          <ActionForm action={renameOrganization} submitLabel="Guardar" successMessage="Nombre actualizado." className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <input type="hidden" name="id" value={org.id} />
            <label className="flex flex-1 flex-col gap-2">
              <span className="label-caps">Nombre</span>
              <TextInput name="name" required minLength={2} maxLength={120} defaultValue={org.name} />
            </label>
          </ActionForm>
        </section>
      )}

      <section className="mt-8">
        <h2 className="label-caps">Miembros</h2>
        {!isAdmin && (
          <div className="panel mt-3 p-6 text-sm text-foreground-muted">Solo un administrador puede ver los miembros de la organización.</div>
        )}
        {isAdmin && (!members || members.length === 0) && (
          <div className="panel mt-3 p-6 text-sm text-foreground-muted">Esta organización aún no tiene miembros. Invita a un cliente desde Usuarios.</div>
        )}
        {isAdmin && members && members.length > 0 && (
          <ul className="panel mt-3 divide-y divide-border-subtle">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.profiles?.full_name || m.profiles?.email}</div>
                  <div className="text-xs text-foreground-subtle">
                    {m.profiles?.email} · {ROLE_LABEL[m.role]}
                    {m.profiles && !m.profiles.is_active && " · inactivo"}
                  </div>
                </div>
                {isAdmin && (
                  <ActionForm action={removeMembership} submitLabel="Quitar" successMessage="Miembro quitado." variant="secondary" inline>
                    <input type="hidden" name="organization_id" value={org.id} />
                    <input type="hidden" name="user_id" value={m.user_id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
