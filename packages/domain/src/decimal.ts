import Decimal from "decimal.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40
});

export const D = (value: Decimal.Value): Decimal => new Decimal(value);
export const ZERO = D(0);
export const ONE = D(1);

export function decimalString(value: Decimal): string {
  const fixed = value.toFixed();
  if (!fixed.includes(".")) return fixed === "-0" ? "0" : fixed;
  const normalized = fixed.replace(/\.?0+$/, "");
  return normalized === "-0" || normalized === "" ? "0" : normalized;
}

export function sum(values: Iterable<Decimal>): Decimal {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}

export { Decimal };
