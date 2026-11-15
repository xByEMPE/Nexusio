export const SITE_KIND_LABEL = {
  wind_farm: "Parque eólico",
  solar_plant: "Planta solar",
  transmission_line: "Línea de transmisión",
} as const;

export const ASSET_KIND_LABEL = {
  wind_turbine: "Turbina",
  solar_block: "Bloque solar",
  transmission_tower: "Torre",
  transmission_span: "Vano",
} as const;

export const PROJECT_STATUS_LABEL = {
  planned: "Planeado",
  in_field: "En campo",
  processing: "Procesando",
  in_review: "En revisión",
  delivered: "Entregado",
  archived: "Archivado",
} as const;

export const INSPECTION_KIND_LABEL = {
  wind_blade: "Palas",
  solar: "Solar",
  transmission: "Transmisión",
} as const;

export const INSPECTION_STATUS_LABEL = {
  pending: "Pendiente",
  captured: "Capturada",
  processing: "Procesando",
  in_review: "En revisión",
  approved: "Aprobada",
} as const;

/** Parámetro `?org=` válido (uuid) o undefined. */
export function orgParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined;
}
