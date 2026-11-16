// Posición de la turbina desde la foto `_ID` (spec §9.1): punto del láser o GPS del dron.
export type TurbinePosition = { lat: number; lon: number; source: "lrf_target" | "gps" };

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const f = Number(v.trim());
    return Number.isFinite(f) ? f : null;
  }
  return null;
}

function valid(lat: number | null, lon: number | null): lat is number {
  return (
    lat !== null && lon !== null && !(lat === 0 && lon === 0) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  );
}

export function turbinePosition(exif: Record<string, unknown>): TurbinePosition | null {
  const dist = num(exif.LRFTargetDistance);
  const tLat = num(exif.LRFTargetLat);
  const tLon = num(exif.LRFTargetLon);
  if (exif.LRFStatus === "Normal" && dist !== null && dist > 0 && valid(tLat, tLon)) {
    return { lat: tLat as number, lon: tLon as number, source: "lrf_target" };
  }
  const lat = num(exif.GPSLatitude);
  const lon = num(exif.GPSLongitude);
  if (valid(lat, lon)) return { lat: lat as number, lon: lon as number, source: "gps" };
  return null;
}
