import type { Task } from "graphile-worker";
import { Pool } from "pg";
import { parseCalculationInput } from "@costeo/contracts";
import { calculate, sha256Canonical } from "@costeo/domain";
import { persistRunResult, withTenantTransaction } from "@costeo/database";

interface CalculateRunPayload {
  empresa_id: string;
  corrida_version_id: string;
  job_id: string;
  input: unknown;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL es obligatoria para el worker.");
const pool = new Pool({ connectionString, max: 4 });

export const calculateRun: Task = async (rawPayload, helpers) => {
  const payload = rawPayload as unknown as CalculateRunPayload;
  const input = parseCalculationInput(payload.input);
  const result = calculate(input);
  const inputHash = await sha256Canonical(input);
  const resultHash = await sha256Canonical(result);
  const rootHash = await sha256Canonical({ input_hash: inputHash, result_hash: resultHash });

  await withTenantTransaction(pool, payload.empresa_id, (client) => persistRunResult(client, {
    empresa_id: payload.empresa_id,
    corrida_version_id: payload.corrida_version_id,
    job_id: payload.job_id,
    input,
    input_hash: inputHash,
    result_hash: resultHash,
    root_hash: rootHash,
    result
  }));

  helpers.logger.info(`Corrida ${payload.corrida_version_id} procesada; ok=${result.ok}`);
};
