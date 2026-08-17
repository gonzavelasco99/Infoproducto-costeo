import type { CalculationInput, CalculationOutcome } from "@costeo/domain";

const DEFAULT_API_URL = "http://localhost:4000";
const REQUEST_TIMEOUT_MS = 75_000;

interface CalculationEnvelope {
  data: CalculationOutcome;
  meta?: {
    request_id?: string;
    input_hash?: string;
    result_hash?: string;
  };
}

export interface RemoteCalculation {
  outcome: CalculationOutcome;
  requestId?: string;
}

export function normalizeApiBaseUrl(configuredUrl?: string): string {
  return (configuredUrl?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");
}

function isCalculationOutcome(value: unknown): value is CalculationOutcome {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { ok?: unknown; validaciones?: unknown };
  return typeof candidate.ok === "boolean" && Array.isArray(candidate.validaciones);
}

export async function calculateViaApi(
  input: CalculationInput,
  options: {
    baseUrl?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {}
): Promise<RemoteCalculation> {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl ?? process.env.NEXT_PUBLIC_API_URL);
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const response = await fetcher(`${baseUrl}/v1/calculations/free`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal
    });
    const payload: unknown = await response.json().catch(() => null);
    const envelope = payload as Partial<CalculationEnvelope> | null;

    if (envelope && isCalculationOutcome(envelope.data)) {
      return {
        outcome: envelope.data,
        ...(envelope.meta?.request_id ? { requestId: envelope.meta.request_id } : {})
      };
    }

    throw new Error(`La API de cálculo respondió ${response.status} sin un resultado compatible.`);
  } finally {
    clearTimeout(timeout);
  }
}
