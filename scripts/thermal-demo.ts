/**
 * Genera una foto térmica sintética (640×512, 25 °C con un disco caliente de
 * 68 °C) y la ingesta pareada con una foto RGB real mediante el contrato de
 * subida (Storage + rpc ingest_manifest), con la sesión de un técnico.
 *
 *   NEXUS_PASSWORD=... NEXUS_SUPABASE_URL=http://127.0.0.1:54321 \
 *   NEXUS_PUBLISHABLE_KEY=... npm run thermal-demo -- \
 *     --project <uuid> --inspection <uuid> --pair <capture_id_rgb> --email tecnico@nexus.local
 *
 * Idempotente: el id de la captura térmica es un UUID v5 del id del par.
 */
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { IngestManifestSchema, type IngestCapture } from "../src/contracts/ingest-manifest";
import { encodeThermal, renderThermal, type ThermalMatrix } from "../src/lib/blade/thermal";

/** Espacio de nombres fijo (UUID v4 arbitrario, no cambiar: rompería la idempotencia). */
export const THERMAL_DEMO_NAMESPACE = "5b0f3a52-8c1e-4d7a-9a63-2f1d6c4e7b90";

const W = 640;
const H = 512;
const BASE_C = 25;
const HOT_C = 68;
const HOT = { x: 400, y: 260, r: 20 };
const SCALE = 0.01;
const OFFSET = -100;

/** UUID v5 (SHA-1) de `name` en el espacio `namespace`. */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** Matriz 640×512 a 25 °C con un disco caliente de radio 20 px a 68 °C en (400, 260). */
export function buildThermalMatrix(): ThermalMatrix {
  const data = new Float32Array(W * H).fill(BASE_C);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - HOT.x;
      const dy = y - HOT.y;
      if (dx * dx + dy * dy <= HOT.r * HOT.r) data[y * W + x] = HOT_C;
    }
  }
  return { width: W, height: H, data };
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      inspection: { type: "string" },
      pair: { type: "string" },
      email: { type: "string" },
    },
  });
  const { project, inspection, pair, email } = values;
  if (!project || !inspection || !pair || !email) {
    throw new Error("Uso: --project <uuid> --inspection <uuid> --pair <uuid> --email <correo>");
  }

  const sb = createClient(need("NEXUS_SUPABASE_URL"), need("NEXUS_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await sb.auth.signInWithPassword({ email, password: need("NEXUS_PASSWORD") });
  if (auth.error) throw new Error(`Sesión rechazada: ${auth.error.message}`);

  const proj = await sb.from("projects").select("organization_id").eq("id", project).single();
  if (proj.error) throw new Error(`Proyecto: ${proj.error.message}`);
  const insp = await sb
    .from("inspections")
    .select("id, asset_id, kind, inspected_at, pilot_name, assistant_name, drone_model, blade_length_m, id_capture_id, notes")
    .eq("id", inspection)
    .single();
  if (insp.error) throw new Error(`Inspección: ${insp.error.message}`);
  const rgb = await sb
    .from("captures")
    .select("id, file_name, sequence_index, captured_at, lat, lon, alt_abs_m, alt_rel_m, drone_model, blade_captures(blade, face, radius_center_m, sequence_direction, chord_length_mm)")
    .eq("id", pair)
    .eq("inspection_id", inspection)
    .single();
  if (rgb.error) throw new Error(`Captura pareada: ${rgb.error.message}`);
  const bc = Array.isArray(rgb.data.blade_captures) ? rgb.data.blade_captures[0] : rgb.data.blade_captures;

  // Imágenes
  const matrix = buildThermalMatrix();
  const matrixPng = encodeThermal(matrix, SCALE, OFFSET);
  const rgba = Buffer.from(renderThermal(matrix, "hierro", BASE_C, HOT_C));
  const raw = { raw: { width: W, height: H, channels: 4 as const } };
  const original = await sharp(rgba, raw).jpeg({ quality: 90 }).toBuffer();
  const preview = await sharp(rgba, raw).webp({ quality: 80 }).toBuffer();
  const thumb = await sharp(rgba, raw).resize(160, 128).webp({ quality: 70 }).toBuffer();

  const id = uuidV5(pair, THERMAL_DEMO_NAMESPACE);
  const dir = `${proj.data.organization_id}/${project}/${inspection}/captures/${id}`;
  const files: [string, Uint8Array, string][] = [
    ["thermal.png", matrixPng, "image/png"],
    ["original.jpg", original, "image/jpeg"],
    ["preview.webp", preview, "image/webp"],
    ["thumb.webp", thumb, "image/webp"],
  ];
  for (const [name, body, contentType] of files) {
    const up = await sb.storage.from("inspection-media").upload(`${dir}/${name}`, body, { contentType, upsert: true });
    if (up.error) throw new Error(`Subida de ${name}: ${up.error.message}`);
  }

  const capture: IngestCapture = {
    id,
    sha256: sha256(original),
    spectrum: "thermal",
    file_name: rgb.data.file_name.replace(/_V(\.[^.]+)?$/i, "_T$1").replace(/_V_/i, "_T_"),
    sequence_index: rgb.data.sequence_index ?? null,
    paths: { original: `${dir}/original.jpg`, preview: `${dir}/preview.webp`, thumb: `${dir}/thumb.webp` },
    width_px: W,
    height_px: H,
    captured_at: rgb.data.captured_at ?? null,
    drone_model: rgb.data.drone_model ?? null,
    paired_capture_id: pair,
    blade: bc
      ? {
          position: bc.blade,
          face: bc.face,
          radius_center_m: bc.radius_center_m == null ? null : Number(bc.radius_center_m),
          sequence_direction: bc.sequence_direction,
          chord_length_mm: bc.chord_length_mm == null ? null : Number(bc.chord_length_mm),
        }
      : null,
    thermal: {
      matrix_path: `${dir}/thermal.png`,
      temp_scale: SCALE,
      temp_offset: OFFSET,
      t_min_c: BASE_C,
      t_max_c: HOT_C,
      emissivity: 0.95,
    },
    metadata: { synthetic: true, generator: "thermal-demo" },
  };

  const i = insp.data;
  const manifest = IngestManifestSchema.parse({
    manifest_version: 1,
    generated_at: new Date().toISOString(),
    app: { name: "thermal-demo", version: "1.0.0" },
    project_id: project,
    inspection: {
      id: i.id,
      asset_id: i.asset_id,
      kind: i.kind,
      inspected_at: i.inspected_at,
      pilot_name: i.pilot_name,
      assistant_name: i.assistant_name,
      drone_model: i.drone_model,
      blade_length_m: i.blade_length_m == null ? null : Number(i.blade_length_m),
      id_capture_id: i.id_capture_id,
      notes: i.notes,
    },
    captures: [capture],
    findings: [],
  });

  const res = await sb.rpc("ingest_manifest", { p_manifest: manifest });
  if (res.error) throw new Error(`ingest_manifest: ${res.error.message} ${JSON.stringify(res.error.details ?? "")}`);
  console.log(JSON.stringify({ capture_id: id, result: res.data }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
