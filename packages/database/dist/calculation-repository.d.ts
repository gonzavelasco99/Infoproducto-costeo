import type { PoolClient } from "pg";
import type { CalculationInput, CalculationOutcome } from "@costeo/domain";
export interface PersistedRunPayload {
    empresa_id: string;
    corrida_version_id: string;
    job_id: string;
    input: CalculationInput;
    input_hash: string;
    result_hash: string;
    root_hash: string;
    result: CalculationOutcome;
}
export declare function persistRunResult(client: PoolClient, payload: PersistedRunPayload): Promise<void>;
