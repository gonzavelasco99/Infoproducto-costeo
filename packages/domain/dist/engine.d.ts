import { Decimal } from "./decimal.js";
import type { CalculationInput, CalculationOutcome } from "./types.js";
export declare const ENGINE_VERSION: "0.1.0";
export declare const SCHEMA_VERSION: "2026-07-27.beta1";
export declare function decomposeGross(gross: Decimal, vatRate: Decimal): {
    net: Decimal;
    vat: Decimal;
};
export declare function calculate(input: CalculationInput): CalculationOutcome;
