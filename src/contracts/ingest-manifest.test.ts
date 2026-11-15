import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, test } from "vitest";
import jsonSchema from "./ingest-manifest.v1.schema.json";
import { IngestManifestSchema, MANIFEST_VERSION } from "./ingest-manifest";

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateJsonSchema = ajv.compile(jsonSchema);

const dir = join(__dirname, "__fixtures__", "manifest");
const fixtures = readdirSync(dir)
  .filter((n) => n.endsWith(".json"))
  .sort()
  .map((n) => ({
    name: n.replace(/\.json$/, ""),
    data: JSON.parse(readFileSync(join(dir, n), "utf8")) as unknown,
  }));

describe("manifiesto v1", () => {
  test("hay fixtures válidos e inválidos", () => {
    expect(fixtures.filter((f) => f.name.startsWith("valid-")).length).toBeGreaterThanOrEqual(2);
    expect(fixtures.filter((f) => f.name.startsWith("invalid-")).length).toBeGreaterThanOrEqual(5);
  });

  test("la versión del esquema coincide", () => {
    expect(MANIFEST_VERSION).toBe(1);
    expect(jsonSchema.properties.manifest_version.const).toBe(MANIFEST_VERSION);
  });

  for (const f of fixtures) {
    test(`${f.name}: Zod y JSON Schema coinciden`, () => {
      const zodOk = IngestManifestSchema.safeParse(f.data).success;
      const ajvOk = validateJsonSchema(f.data);
      expect(zodOk).toBe(f.name.startsWith("valid-"));
      expect(ajvOk).toBe(zodOk);
    });
  }
});
