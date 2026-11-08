import type { FleetSize, Hosting, Industry, InspectionObjective, Service, Timeline } from "@/contracts/assessment";

type Options<T extends string> = readonly { readonly value: T; readonly label: string; readonly hint?: string }[];

export const INDUSTRY_OPTIONS: Options<Industry> = [
  { value: "mining", label: "Minería" },
  { value: "energy_transmission", label: "Líneas eléctricas" },
  { value: "renewables", label: "Solar / eólica" },
  { value: "oil_gas", label: "Petróleo y gas" },
  { value: "civil_infrastructure", label: "Construcción y obras" },
  { value: "telecom", label: "Telecomunicaciones" },
  { value: "precision_agriculture", label: "Agricultura" },
  { value: "other", label: "Otra" },
];

export const SERVICE_OPTIONS: Options<Service> = [
  { value: "dji_app", label: "App para control DJI", hint: "Automatizar vuelos o capturas" },
  { value: "project_platform", label: "Plataforma de gestión", hint: "Ver proyectos, hallazgos y reportes" },
  { value: "website", label: "Página o servicio web", hint: "Sitio, formulario o integración" },
  { value: "undecided", label: "Aún no lo tengo claro", hint: "Lo definimos juntos" },
];

export const FLEET_SIZE_OPTIONS: Options<FleetSize> = [
  { value: "none", label: "Aún no tengo" },
  { value: "1-3", label: "1 a 3" },
  { value: "4-10", label: "4 a 10" },
  { value: "11-30", label: "11 a 30" },
  { value: "30+", label: "Más de 30" },
];

export const HOSTING_OPTIONS: Options<Hosting> = [
  { value: "cloud", label: "En la nube", hint: "Ustedes se encargan del servidor" },
  { value: "on_premise", label: "En nuestros servidores", hint: "Dentro de nuestra red" },
  { value: "undecided", label: "Sin preferencia", hint: "Necesito recomendación" },
];

export const OBJECTIVE_OPTIONS: Options<InspectionObjective> = [
  { value: "structural_defects", label: "Detectar daños en estructuras" },
  { value: "thermal_inspection", label: "Inspección térmica" },
  { value: "volumes", label: "Medir volúmenes y acopios" },
  { value: "maps", label: "Mapas y ortofotos" },
  { value: "progress_tracking", label: "Seguimiento de avance de obra" },
  { value: "crop_monitoring", label: "Monitoreo de cultivos" },
  { value: "photo_records", label: "Registro fotográfico para reportes" },
  { value: "other", label: "Otro" },
];

export const TIMELINE_OPTIONS: Options<Timeline> = [
  { value: "lt_3m", label: "Menos de 3 meses" },
  { value: "3_6m", label: "3 a 6 meses" },
  { value: "6_12m", label: "6 a 12 meses" },
  { value: "exploratory", label: "Solo estoy explorando" },
];
