import { TextInput } from "@/components/assessment/fields";
import { SelectField } from "@/components/inspections/admin/ActionForm";
import { ASSET_KIND_LABEL, SITE_KIND_LABEL } from "@/lib/inspections/labels";

type SiteDefaults = { kind?: string; name?: string; lat?: number | null; lon?: number | null };

export function SiteFields({
  orgs,
  organizationId,
  defaults = {},
}: {
  orgs?: { id: string; name: string }[];
  organizationId?: string;
  defaults?: SiteDefaults;
}) {
  return (
    <>
      {orgs ? (
        <SelectField label="Organización" name="organization_id" required defaultValue={organizationId}>
          <option value="">Elige…</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
      ) : (
        <input type="hidden" name="organization_id" value={organizationId} />
      )}
      <SelectField label="Tipo" name="kind" required defaultValue={defaults.kind ?? "wind_farm"}>
        {Object.entries(SITE_KIND_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <label className="flex flex-col gap-2">
        <span className="label-caps">Nombre</span>
        <TextInput name="name" required minLength={2} maxLength={120} defaultValue={defaults.name} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2">
          <span className="label-caps">Latitud</span>
          <TextInput name="lat" type="number" step="any" min={-90} max={90} defaultValue={defaults.lat ?? undefined} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Longitud</span>
          <TextInput name="lon" type="number" step="any" min={-180} max={180} defaultValue={defaults.lon ?? undefined} />
        </label>
      </div>
    </>
  );
}

type AssetDefaults = {
  kind?: string;
  name?: string;
  code?: string | null;
  lat?: number | null;
  lon?: number | null;
  manufacturer?: string | null;
  model?: string | null;
  blade_length_m?: number | null;
  rotor_diameter_m?: number | null;
};

const num = (label: string, name: string, min: number, max: number, v?: number | null) => (
  <label className="flex flex-col gap-2">
    <span className="label-caps">{label}</span>
    <TextInput name={name} type="number" step="any" min={min} max={max} defaultValue={v ?? undefined} />
  </label>
);

export function AssetFields({ siteId, defaults = {} }: { siteId: string; defaults?: AssetDefaults }) {
  return (
    <>
      <input type="hidden" name="site_id" value={siteId} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Tipo" name="kind" required defaultValue={defaults.kind ?? "wind_turbine"}>
          {Object.entries(ASSET_KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Nombre</span>
          <TextInput name="name" required maxLength={60} defaultValue={defaults.name} placeholder="WTG-01" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Código</span>
          <TextInput name="code" maxLength={60} defaultValue={defaults.code ?? undefined} />
        </label>
        <span />
        {num("Latitud", "lat", -90, 90, defaults.lat)}
        {num("Longitud", "lon", -180, 180, defaults.lon)}
      </div>
      <fieldset className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-3">
        <legend className="label-caps pr-2">Turbina (solo para tipo Turbina)</legend>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Fabricante</span>
          <TextInput name="manufacturer" maxLength={80} defaultValue={defaults.manufacturer ?? undefined} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label-caps">Modelo</span>
          <TextInput name="model" maxLength={80} defaultValue={defaults.model ?? undefined} />
        </label>
        <span className="hidden sm:block" />
        {num("Pala (m)", "blade_length_m", 1, 150, defaults.blade_length_m)}
        {num("Rotor (m)", "rotor_diameter_m", 1, 300, defaults.rotor_diameter_m)}
      </fieldset>
    </>
  );
}
