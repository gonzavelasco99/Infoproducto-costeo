import Decimal from "decimal.js";
export declare const D: (value: Decimal.Value) => Decimal;
export declare const ZERO: Decimal;
export declare const ONE: Decimal;
export declare function decimalString(value: Decimal): string;
export declare function sum(values: Iterable<Decimal>): Decimal;
export { Decimal };
