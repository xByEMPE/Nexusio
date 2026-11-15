import { TextInput } from "@/components/assessment/fields";
import { ActionForm, SelectField } from "@/components/inspections/admin/ActionForm";
import { InviteKindFields } from "@/components/inspections/admin/InviteKindFields";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";
import { createSessionClient } from "@/services/supabase/server";
import { inviteUser, setUserActive } from "../actions/users";

export const metadata = { title: "Usuarios" };

const PLATFORM_LABEL = { admin: "Administrador", technician: "Técnico", service: "Servicio" } as const;
const MEMBER_LABEL = { client_manager: "Gerente", client_viewer: "Lector" } as const;

export default async function UsersPage() {
  assertInspectionsEnabled();
  const viewer = await requireStaff();
  const isAdmin = viewer.platformRole === "admin";
  const sb = await createSessionClient();

  const [staff, members, orgs] = sb
    ? await Promise.all([
        sb.from("profiles").select("id, email, full_name, platform_role, is_active").not("platform_role", "is", null).order("email"),
        sb
          .from("organization_members")
          .select("user_id, organization_id, role, organizations(name), profiles(id, email, full_name, is_active)")
          .order("created_at"),
        sb.from("organizations").select("id, name").order("name"),
      ])
    : [null, null, null];

  const failed = !sb || staff?.error || members?.error;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section className="min-w-0">
        <h1 className="text-2xl font-medium">Usuarios</h1>
        {failed && <p className="mt-4 text-sm text-signal-critical">No fue posible cargar los usuarios.</p>}

        <h2 className="label-caps mt-6">Personal</h2>
        <ul className="panel mt-3 divide-y divide-border-subtle">
          {(staff?.data ?? []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="truncate font-medium">{u.full_name || u.email}</div>
                <div className="text-xs text-foreground-subtle">
                  {u.email} · {u.platform_role ? PLATFORM_LABEL[u.platform_role] : ""} · {u.is_active ? "activo" : "inactivo"}
                </div>
              </div>
              {isAdmin && u.id !== viewer.user.id && <ToggleActive userId={u.id} active={u.is_active} />}
            </li>
          ))}
        </ul>

        <h2 className="label-caps mt-8">Clientes</h2>
        {!isAdmin && (
          <div className="panel mt-3 p-6 text-sm text-foreground-muted">Solo un administrador puede ver las cuentas de clientes.</div>
        )}
        {isAdmin && (members?.data ?? []).length === 0 && (
          <div className="panel mt-3 p-6 text-sm text-foreground-muted">Aún no hay clientes.</div>
        )}
        {isAdmin && (members?.data ?? []).length > 0 && (
          <ul className="panel mt-3 divide-y divide-border-subtle">
            {(members?.data ?? []).map((m) => (
              <li key={`${m.organization_id}-${m.user_id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.profiles?.full_name || m.profiles?.email}</div>
                  <div className="text-xs text-foreground-subtle">
                    {m.profiles?.email} · {m.organizations?.name} · {MEMBER_LABEL[m.role]} ·{" "}
                    {m.profiles?.is_active ? "activo" : "inactivo"}
                  </div>
                </div>
                {m.profiles && <ToggleActive userId={m.profiles.id} active={m.profiles.is_active} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <aside className="panel h-fit p-5">
          <h2 className="label-caps">Invitar usuario</h2>
          <p className="mt-2 text-xs text-foreground-subtle">Recibirá un correo para fijar su contraseña.</p>
          <ActionForm action={inviteUser} submitLabel="Enviar invitación" successMessage="Invitación enviada." className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="label-caps">Correo</span>
              <TextInput name="email" type="email" required autoComplete="off" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="label-caps">Nombre completo</span>
              <TextInput name="full_name" required minLength={2} maxLength={120} autoComplete="off" />
            </label>
            <InviteKindFields>
              {{
                staff: (
                  <SelectField label="Rol de plataforma" name="platform_role" required>
                    <option value="technician">Técnico</option>
                    <option value="admin">Administrador</option>
                    <option value="service">Servicio</option>
                  </SelectField>
                ),
                client: (
                  <>
                    <SelectField label="Organización" name="organization_id" required>
                      <option value="">Elige…</option>
                      {(orgs?.data ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField label="Rol en la organización" name="member_role" required defaultValue="client_viewer">
                      <option value="client_viewer">Lector</option>
                      <option value="client_manager">Gerente</option>
                    </SelectField>
                  </>
                ),
              }}
            </InviteKindFields>
          </ActionForm>
        </aside>
      )}
    </div>
  );
}

function ToggleActive({ userId, active }: { userId: string; active: boolean }) {
  return (
    <ActionForm
      action={setUserActive}
      submitLabel={active ? "Desactivar" : "Activar"}
      successMessage="Cuenta actualizada."
      variant="secondary"
      inline
    >
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
    </ActionForm>
  );
}
