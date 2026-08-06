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
      precio_neto_unitario: "100"
    }],
    ...overrides
  };
}

export function baseInput(items: ItemInput[]): CalculationInput {
  return {
    schema_version: "2026-07-31.beta2",
    calculation_id: ids.calculation,
    configuracion: {
      tipo_actividad: items.some((item) => item.origen_item === "mixto")
        ? "mixto"
        : items.some((item) => item.vendible && item.origen_item === "fabricado")
          ? "fabricacion"
          : "reventa",
      objetivo: "ambos",
      madurez_datos: "intermedia",
      condicion_fiscal: "responsable_inscripto",
      canal_default: "venta_general",
      importes_sin_iva: true
    },
    moneda_base: "ARS",
    items,
    costos: []
  };
}
