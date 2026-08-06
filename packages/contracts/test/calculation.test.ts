import { describe, expect, it } from "vitest";
import { migrateLegacyCalculationInput } from "../src/index.js";

describe("migración del archivo gratuito beta1", () => {
  it("convierte importes computables a netos y conserva el resultado económico", () => {
    const migrated = migrateLegacyCalculationInput({
      schema_version: "2026-07-27.beta1",
      calculation_id: "00000000-0000-4000-8000-000000000010",
      moneda_base: "ars",
      items: [{
        item_id: "00000000-0000-4000-8000-000000000002",
        codigo: "REV-001",
        nombre: "Mercadería",
        tipo_item: "mercaderia_reventa",
        origen_item: "comprado",
        vendible: true,
        inventariable: true,
        unidad_base_id: "00000000-0000-4000-8000-000000000001",
        compras: [{
          compra_id: "00000000-0000-4000-8000-000000000006",
          cantidad_base: "1",
          precio_bruto_unitario: "121",
          alicuota_iva: "0.21",
          tratamiento_iva: "computable"
        }],
        venta: {
          cantidad_base: "2",
          precio_bruto_unitario: "242",
          alicuota_iva: "0.21"
        }
      }],
      costos: [{
        costo_id: "00000000-0000-4000-8000-000000000009",
        nombre: "Administración",
        categoria: "administracion",
        monto_total: "50",
        trazabilidad: "indirecto",
        comportamiento: "fijo",
        driver: { tipo: "ventas_netas" }
      }]
    });

    expect(migrated).toMatchObject({
      schema_version: "2026-07-31.beta2",
      moneda_base: "ARS",
      configuracion: { tipo_actividad: "reventa", importes_sin_iva: true },
      costos: [{ monto_neto_total: "50" }]
    });
    expect(migrated.items[0]?.compras?.[0]?.precio_neto_unitario).toBe("100");
    expect(migrated.items[0]?.venta?.precio_neto_unitario).toBe("200");
  });
});
