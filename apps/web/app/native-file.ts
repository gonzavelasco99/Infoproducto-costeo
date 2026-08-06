import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseCalculationInputWithMigration } from "@costeo/contracts";
import { canonicalStringify, sha256Canonical } from "@costeo/domain";
import type { CalculationInput } from "@costeo/domain";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

interface NativeManifest {
  format: "costeo-free";
  schema_version: "2026-07-27.beta1" | "2026-07-31.beta2";
  created_at: string;
  input_hash: string;
}

export async function createNativeFile(input: CalculationInput): Promise<Blob> {
  const manifest: NativeManifest = {
    format: "costeo-free",
    schema_version: input.schema_version,
    created_at: new Date().toISOString(),
    input_hash: await sha256Canonical(input)
  };
  const archive = zipSync({
    "manifest.json": strToU8(canonicalStringify(manifest)),
    "input.json": strToU8(canonicalStringify(input))
  }, { level: 6 });
  return new Blob([archive], { type: "application/zip" });
}

export async function readNativeFile(file: File): Promise<CalculationInput> {
  if (file.size > MAX_FILE_BYTES) throw new Error("VAL-FREE-001: el archivo supera 50 MB.");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => entry.name === "manifest.json" || entry.name === "input.json" });
  const manifestBytes = archive["manifest.json"];
  const inputBytes = archive["input.json"];
  if (!manifestBytes || !inputBytes) throw new Error("VAL-FREE-002: el archivo nativo está incompleto.");
  const manifest = JSON.parse(strFromU8(manifestBytes)) as NativeManifest;
  if (manifest.format !== "costeo-free" || !["2026-07-27.beta1", "2026-07-31.beta2"].includes(manifest.schema_version)) {
    throw new Error("VAL-FREE-002: versión de archivo nativo no compatible.");
  }
  const rawInput: unknown = JSON.parse(strFromU8(inputBytes));
  if (await sha256Canonical(rawInput) !== manifest.input_hash) {
    throw new Error("VAL-FREE-002: el hash del archivo nativo no coincide.");
  }
  return parseCalculationInputWithMigration(rawInput);
}
