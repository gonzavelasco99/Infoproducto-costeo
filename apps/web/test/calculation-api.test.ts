import { describe, expect, it, vi } from "vitest";
import type { CalculationInput, CalculationOutcome } from "@costeo/domain";
import { calculateViaApi, normalizeApiBaseUrl } from "../app/calculation-api";

const input = { calculation_id: "test" } as CalculationInput;
const blockedOutcome = {
  ok: false,
  engine_version: "0.3.0",
  schema_version: "2026-07-31.beta2",
  calculation_id: "test",
  validaciones: []
} as unknown as CalculationOutcome;

describe("cliente de cálculo remoto", () => {
  it("normaliza la URL configurada y usa localhost por defecto", () => {
    expect(normalizeApiBaseUrl("https://api.example.com///")).toBe("https://api.example.com");
    expect(normalizeApiBaseUrl(" ")).toBe("http://localhost:4000");
  });

  it("acepta resultados de negocio incluso cuando la API responde 422", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: blockedOutcome,
      meta: { request_id: "req-test" }
    }), { status: 422, headers: { "content-type": "application/json" } }));

    const result = await calculateViaApi(input, {
      baseUrl: "https://api.example.com/",
      fetcher: fetcher as typeof fetch
    });

    expect(result).toEqual({ outcome: blockedOutcome, requestId: "req-test" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.com/v1/calculations/free",
      expect.objectContaining({ method: "POST", credentials: "omit" })
    );
  });

  it("rechaza respuestas que no respetan el contrato del sobre", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "unexpected" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    }));

    await expect(calculateViaApi(input, {
      baseUrl: "https://api.example.com",
      fetcher: fetcher as typeof fetch
    })).rejects.toThrow("respondió 500");
  });
});
