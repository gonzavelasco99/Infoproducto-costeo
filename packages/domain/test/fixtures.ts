import type { CalculationInput, ItemInput } from "../src/index.js";

export const ids = {
  unit: "00000000-0000-4000-8000-000000000001",
  raw: "00000000-0000-4000-8000-000000000002",
  finished: "00000000-0000-4000-8000-000000000003",
  resale: "00000000-0000-4000-8000-000000000004",
  mixed: "00000000-0000-4000-8000-000000000005",
  purchase1: "00000000-0000-4000-8000-000000000006",
  purchase2: "00000000-0000-4000-8000-000000000007",
  labor: "00000000-0000-4000-8000-000000000008",
  cost: "00000000-0000-4000-8000-000000000009",
  calculation: "00000000-0000-4000-8000-000000000010"
} as const;

export function purchasedItem(overrides: Partial<ItemInput> = {}): ItemInput {
  return {
    item_id: ids.raw,
    codigo: "MP-001",
    nombre: "Materia prima",
    tipo_item: "materia_prima",
    origen_item: "comprado",
    vendible: false,
    inventariable: true,
    unidad_base_id: ids.unit,
    compras: [{
      compra_id: ids.purchase1,
      cantidad_base: "100",
      precio_bruto_unitario: "121",
      alicuota_iva: "0.21",
      tratamiento_iva: "computable"
    }],
    ...overrides
  };
}

export function baseInput(items: ItemInput[]): CalculationInput {
  return {
    schema_version: "2026-07-27.beta1",
    calculation_id: ids.calculation,
    moneda_base: "ARS",
    items,
    costos: []
  };
}
