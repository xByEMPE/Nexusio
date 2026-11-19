import { TextArea, TextInput } from "@/components/assessment/fields";
import { SelectField } from "@/components/inspections/admin/ActionForm";
import { PROJECT_STATUS_LABEL } from "@/lib/inspections/labels";

type Defaults = {
  name?: string;
  code?: string | null;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  contacts?: string;
  default_pilot_name?: string | null;
  default_assistant_name?: string | null;
  default_drone_model?: string | null;
};

export function ProjectFields({
  orgs,
  organizationId,
  defaults = {},
}: {
  orgs?: { id: string; name: string }[];
  organizationId?: string;
  defaults?: Defaults;
}) {
  return (
    <>
      {orgs && (
        <SelectField label="Organización" name="organization_id" required defaultValue={organizationId}>
          <option value="">Elige…</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
      )}
      {!orgs && <input type="hidden" name="organization_id" value={organizationId} />}
      <label className="flex flex-col gap-2">
        <span className="label-caps">Nombre</span>
        <TextInput name="name" required minLength={2} maxLength={160} defaultValue={defaults.name} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2">
          <span className="label-caps">Código</span>
          <TextInput name="code" maxLength={60} defaultValue={defaults.code ?? undefined} />
        </label>
        <SelectField label="Estado" name="status" required defaultValue={defaults.status ?? "planned"}>
          {Object.entries(PROJECT_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Inicio</span>
          <TextInput name="start_date" type="date" defaultValue={defaults.start_date ?? undefined} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Fin</span>
          <TextInput name="end_date" type="date" defaultValue={defaults.end_date ?? undefined} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="label-caps">Piloto (por defecto)</span>
          <TextInput name="default_pilot_name" maxLength={500} defaultValue={defaults.default_pilot_name ?? undefined} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Asistente (por defecto)</span>
          <TextInput name="default_assistant_name" maxLength={500} defaultValue={defaults.default_assistant_name ?? undefined} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Dron (modelo)</span>
          <TextInput name="default_drone_model" maxLength={120} defaultValue={defaults.default_drone_model ?? undefined} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-foreground-subtle">
        Se copian a los datos de campo de cada inspección nueva del proyecto (varios nombres: sepáralos con «, »). No cambian las inspecciones ya creadas.
      </p>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Contactos</span>
        <TextArea name="contacts" rows={4} className="min-h-[96px] font-mono text-xs" defaultValue={defaults.contacts} placeholder="Cliente | Ana Pérez | ana@cliente.com" />
        <span className="text-xs text-foreground-subtle">Uno por línea: Rol | Nombre | correo (opcional). Máximo 20.</span>
      </label>
    </>
  );
}
