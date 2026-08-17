import { describe, expect, it } from "vitest";
import { calculate, canonicalStringify, decomposeGross } from "../src/index.js";
import { D } from "../src/decimal.js";
import { baseInput, ids, purchasedItem } from "./fixtures.js";

describe("motor determinista de costeo beta", () => {
  it("FND-004 descompone bruto, neto e IVA sin float binario", () => {
    const result = decomposeGross(D("121"), D("0.21"));
    expect(result.net.toString()).toBe("100");
    expect(result.vat.toString()).toBe("21");
  });

  it("calcula el caso patrón de fabricación y concilia ambas vistas", () => {
    const raw = purchasedItem();
    const finished = {
      item_id: ids.finished,
      codigo: "PT-001",
      nombre: "Producto terminado",
      tipo_item: "producto_final" as const,
      origen_item: "fabricado" as const,
      vendible: true,
      inventariable: true,
      unidad_base_id: ids.unit,
      receta: {
        cantidad_salida_base: "1",
        componentes: [{
          item_componente_id: ids.raw,
          cantidad_neta: "1",
          merma_estandar: "0.1"
        }]
      },
      mano_obra: [{
        rol_id: ids.labor,
        horas_estandar: "2",
        costo_hora_completo: "10",
        comportamiento: "variable" as const
      }],
      venta: {
        cantidad_base: "10",
        precio_neto_unitario: "200"
      }
    };
    const input = baseInput([raw, finished]);
    input.costos.push({
      costo_id: ids.cost,
      nombre: "Administración",
      categoria: "administracion",
      monto_neto_total: "300",
      trazabilidad: "indirecto",
      comportamiento: "fijo",
      driver: { tipo: "ventas_netas" }
    });

    const result = calculate(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orden_costeo).toEqual([ids.raw, ids.finished]);
    expect(result.resultados_item[0]?.ventas_netas).toBe("2000");
    expect(D(result.resultados_item[0]?.costo_directo ?? 0).toDecimalPlaces(6).toString()).toBe("1311.111111");
    expect(result.conciliacion.conciliado).toBe(true);
    expect(result.conciliacion.diferencia_vistas).toBe("0");
  });

  it("calcula el caso patrón de reventa con costo directo adicional", () => {
    const resale = purchasedItem({
      item_id: ids.resale,
      codigo: "REV-001",
      nombre: "Mercadería",
      tipo_item: "mercaderia_reventa",
      vendible: true,
      venta: { cantidad_base: "10", precio_neto_unitario: "150" }
    });
    const input = baseInput([resale]);
    input.costos.push({
      costo_id: ids.cost,
      nombre: "Flete directo",
      categoria: "logistica",
      monto_neto_total: "100",
      trazabilidad: "directo",
      comportamiento: "variable",
      item_directo_id: ids.resale
    });
    const result = calculate(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resultados_item[0]).toMatchObject({
      ventas_netas: "1500",
      costo_directo: "1100",
      resultado_operativo_trazabilidad: "400",
      resultado_operativo_comportamiento: "400"
    });
  });

  it("mantiene separadas y pondera las fuentes de un ítem mixto", () => {
    const raw = purchasedItem();
    const mixed = {
      ...purchasedItem({
        item_id: ids.mixed,
        codigo: "MIX-001",
        nombre: "Producto mixto",
        tipo_item: "producto_final",
        origen_item: "mixto",
        vendible: true,
        compras: [{
          compra_id: ids.purchase2,
          cantidad_base: "10",
          precio_neto_unitario: "200"
        }]
      }),
      participacion_comprada: "0.25",
      receta: {
        cantidad_salida_base: "1",
        componentes: [{ item_componente_id: ids.raw, cantidad_neta: "1", merma_estandar: "0" }]
      },
      mano_obra: [{ rol_id: ids.labor, horas_estandar: "2", costo_hora_completo: "10", comportamiento: "fijo" as const }],
      venta: { cantidad_base: "5", precio_neto_unitario: "200" }
    };
    const result = calculate(baseInput([raw, mixed]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cost = result.costos_item.find((entry) => entry.item_id === ids.mixed);
    expect(cost).toMatchObject({
      costo_unitario_aplicable: "140",
      costo_unitario_variable: "125",
      costo_unitario_fijo: "15",
      fuente_costo: "mixto"
    });
    expect(result.resultado_empresa).toBe("300");
  });

  it("bloquea ciclos directos o indirectos de BOM", () => {
    const first = purchasedItem({
      item_id: ids.raw,
      origen_item: "fabricado",
      receta: { cantidad_salida_base: "1", componentes: [{ item_componente_id: ids.finished, cantidad_neta: "1", merma_estandar: "0" }] }
    });
    const second = purchasedItem({
      item_id: ids.finished,
      codigo: "PT-001",
      origen_item: "fabricado",
      receta: { cantidad_salida_base: "1", componentes: [{ item_componente_id: ids.raw, cantidad_neta: "1", merma_estandar: "0" }] }
    });
    const result = calculate(baseInput([first, second]));
    expect(result.ok).toBe(false);
    expect(result.validaciones.some((entry) => entry.codigo === "VAL-BOM-001")).toBe(true);
  });

  it("aplica el límite gratuito aunque los intermedios aparezcan antes que el producto final", () => {
    const purchased = purchasedItem();
    const intermediateTwo = {
      ...purchasedItem({ item_id: ids.resale, codigo: "INT-002", tipo_item: "producto_intermedio", origen_item: "fabricado" }),
      compras: undefined,
      receta: { cantidad_salida_base: "1", componentes: [{ item_componente_id: ids.raw, cantidad_neta: "1", merma_estandar: "0" }] }
    };
    const intermediateOne = {
      ...purchasedItem({ item_id: ids.mixed, codigo: "INT-001", tipo_item: "producto_intermedio", origen_item: "fabricado" }),
      compras: undefined,
      receta: { cantidad_salida_base: "1", componentes: [{ item_componente_id: ids.resale, cantidad_neta: "1", merma_estandar: "0" }] }
    };
    const finished = {
      ...purchasedItem({ item_id: ids.finished, codigo: "PT-001", tipo_item: "producto_final", origen_item: "fabricado", vendible: true }),
      compras: undefined,
      receta: { cantidad_salida_base: "1", componentes: [{ item_componente_id: ids.mixed, cantidad_neta: "1", merma_estandar: "0" }] }
    };
    const result = calculate(baseInput([purchased, intermediateTwo, intermediateOne, finished]));
    expect(result.ok).toBe(false);
    expect(result.validaciones.some((entry) => entry.codigo === "VAL-BOM-007")).toBe(true);
  });

  it("aplica la jerarquía residual si el driver manual es inválido", () => {
    const resale = purchasedItem({
      item_id: ids.resale,
      tipo_item: "mercaderia_reventa",
      vendible: true,
      venta: { cantidad_base: "2", precio_neto_unitario: "200" }
    });
    const input = baseInput([resale]);
    input.costos.push({
      costo_id: ids.cost,
      nombre: "Administración",
      categoria: "administracion",
      monto_neto_total: "30",
      trazabilidad: "indirecto",
      comportamiento: "fijo",
      driver: { tipo: "manual", bases_manuales: { [ids.resale]: "-1" } }
    });
    const result = calculate(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.asignaciones[0]?.driver_aplicado).toBe("costo_directo");
    expect(result.validaciones.some((entry) => entry.codigo === "VAL-DRV-005")).toBe(true);
  });

  it("calcula costo productivo normal y variación de capacidad con importes sin IVA", () => {
    const raw = purchasedItem();
    const finished = {
      item_id: ids.finished,
      codigo: "PT-001",
      nombre: "Producto terminado",
      tipo_item: "producto_final" as const,
      origen_item: "fabricado" as const,
      vendible: true,
      inventariable: true,
      unidad_base_id: ids.unit,
      receta: {
        cantidad_salida_base: "1",
        componentes: [{ item_componente_id: ids.raw, cantidad_neta: "1", merma_estandar: "0" }]
      },
      mano_obra: [{ rol_id: ids.labor, horas_estandar: "2", costo_hora_completo: "10", comportamiento: "variable" as const }],
      venta: { cantidad_base: "10", precio_neto_unitario: "200" }
    };
    const input = baseInput([raw, finished]);
    input.capacidad_normal_horas = "100";
    input.horas_mod_disponibles = "80";
    input.configuracion.alicuota_impuesto_resultado = "0.3";
    input.costos.push({
      costo_id: ids.cost,
      nombre: "Estructura productiva",
      categoria: "produccion",
      monto_neto_total: "1000",
      trazabilidad: "indirecto",
      comportamiento: "fijo",
      driver: { tipo: "horas_mod" }
    });

    const result = calculate(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capacidad).toMatchObject({
      tasa_fija_productiva_normal: "10",
      costo_fijo_absorbido: "200",
      variacion_capacidad: "800"
    });
    expect(result.eficiencia_mod).toEqual({
      horas_disponibles: "80",
      horas_ocupadas: "20",
      cociente_ocupacion: "0.25"
    });
    expect(result.resultados_item[0]).toMatchObject({
      costo_productivo_normal_unitario: "140",
      precio_umbral_contribucion_cero: "120",
      impuesto_resultado_estimado: "0",
      resultado_neto_estimado: "-200"
    });
  });

  it("absorbe el total salarial entre los SKU según sus horas productivas", () => {
    const raw = purchasedItem();
    const firstProduct = {
      item_id: ids.finished,
      codigo: "PT-MOD-A",
      nombre: "Producto MOD A",
      tipo_item: "producto_final" as const,
      origen_item: "fabricado" as const,
      vendible: true,
      inventariable: true,
      unidad_base_id: ids.unit,
      receta: {
        cantidad_salida_base: "1",
        componentes: [{ item_componente_id: ids.raw, cantidad_neta: "1", merma_estandar: "0" }]
      },
      mano_obra: [{ rol_id: ids.labor, horas_estandar: "0.1", costo_hora_completo: "0", comportamiento: "variable" as const }],
      venta: { cantidad_base: "100", precio_neto_unitario: "500" }
    };
    const secondProduct = {
      ...firstProduct,
      item_id: ids.mixed,
      codigo: "PT-MOD-B",
      nombre: "Producto MOD B",
      mano_obra: [{ rol_id: ids.labor, horas_estandar: "0.2", costo_hora_completo: "0", comportamiento: "variable" as const }],
      venta: { cantidad_base: "50", precio_neto_unitario: "500" }
    };
    const input = baseInput([raw, firstProduct, secondProduct]);
    input.configuracion.total_salarios_operarios_periodo = "2000";
    input.configuracion.cantidad_operarios = "1";
    input.configuracion.horas_contratadas_operario_promedio = "100";

    const result = calculate(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eficiencia_mod).toEqual({
      horas_disponibles: "100",
      horas_ocupadas: "20",
      cociente_ocupacion: "0.2"
    });
    const firstResult = result.resultados_item.find((item) => item.codigo === "PT-MOD-A");
    const secondResult = result.resultados_item.find((item) => item.codigo === "PT-MOD-B");
    expect(firstResult).toMatchObject({ costo_mod_unitario: "10", costo_directo_unitario: "110" });
    expect(secondResult).toMatchObject({ costo_mod_unitario: "20", costo_directo_unitario: "120" });
    const absorbedLabor = Number(firstResult?.costo_mod_unitario) * 100
      + Number(secondResult?.costo_mod_unitario) * 50;
    expect(absorbedLabor).toBe(2000);
  });

  it("bloquea el cálculo cuando las horas ocupadas superan la capacidad contratada", () => {
    const raw = purchasedItem();
    const finished = {
      item_id: ids.finished,
      codigo: "PT-SOBRECARGA",
      nombre: "Producto sin capacidad suficiente",
      tipo_item: "producto_final" as const,
      origen_item: "fabricado" as const,
      vendible: true,
      inventariable: true,
      unidad_base_id: ids.unit,
      receta: {
        cantidad_salida_base: "1",
        componentes: [{ item_componente_id: ids.raw, cantidad_neta: "1", merma_estandar: "0" }]
      },
      mano_obra: [{ rol_id: ids.labor, horas_estandar: "2", costo_hora_completo: "0", comportamiento: "variable" as const }],
      venta: { cantidad_base: "10", precio_neto_unitario: "500" }
    };
    const input = baseInput([raw, finished]);
    input.configuracion.total_salarios_operarios_periodo = "1000";
    input.configuracion.cantidad_operarios = "1";
    input.configuracion.horas_contratadas_operario_promedio = "10";

    const result = calculate(input);
    expect(result.ok).toBe(false);
    expect(result.validaciones).toContainEqual(expect.objectContaining({
      codigo: "VAL-MOD-001",
      severidad: "error_bloqueante",
      detalle: {
        horas_ocupadas: "20",
        horas_disponibles: "10",
        exceso_horas: "10"
      }
    }));
  });

  it("bloquea un SKU de reventa cuando la sesión fue configurada como fabricación", () => {
    const resale = purchasedItem({
      item_id: ids.resale,
      tipo_item: "mercaderia_reventa",
      vendible: true,
      venta: { cantidad_base: "1", precio_neto_unitario: "150" }
    });
    const input = baseInput([resale]);
    input.configuracion.tipo_actividad = "fabricacion";
    const result = calculate(input);
    expect(result.ok).toBe(false);
    expect(result.validaciones[0]).toMatchObject({
      severidad: "error_bloqueante",
      fase: "captura"
    });
  });

  it("construye el estado de resultados por categoría e incluye Ganancias estimado", () => {
    const resale = purchasedItem({
      item_id: ids.resale,
      codigo: "REV-001",
      tipo_item: "mercaderia_reventa",
      vendible: true,
      venta: { cantidad_base: "10", precio_neto_unitario: "200" }
    });
    const input = baseInput([resale]);
    input.configuracion.alicuota_impuesto_resultado = "0.3";
    const categories = [
      ["produccion", "100"],
      ["administracion", "50"],
      ["comercializacion", "40"],
      ["logistica", "30"],
      ["impuestos_tasas", "10"],
      ["financieros", "20"],
      ["amortizaciones_depreciaciones", "30"]
    ] as const;
    input.costos = categories.map(([categoria, monto], index) => ({
      costo_id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
      nombre: categoria,
      categoria,
      monto_neto_total: monto,
      trazabilidad: "indirecto",
      comportamiento: "fijo",
      driver: { tipo: "ventas_netas" }
    }));

    const result = calculate(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.estado_resultados).toEqual({
      ingresos_ventas: "2000",
      costos_directos: "1000",
      margen_bruto: "1000",
      gastos_operativos: "100",
      gastos_administrativos: "50",
      gastos_comerciales: "40",
      gastos_logisticos: "30",
      margen_operativo: "780",
      impuestos: "226",
      impuesto_ganancias_estimado: "216",
      gastos_financieros: "20",
      amortizaciones: "30",
      margen_neto: "504"
    });
  });

  it("habilita el resultado neto por empresa y producto cuando hay impuestos cargados sin alícuota", () => {
    const resale = purchasedItem({
      item_id: ids.resale,
      codigo: "REV-IMP",
      tipo_item: "mercaderia_reventa",
      vendible: true,
      venta: { cantidad_base: "10", precio_neto_unitario: "200" }
    });
    const input = baseInput([resale]);
    input.costos = [{
      costo_id: ids.cost,
      nombre: "Impuestos y tasas",
      categoria: "impuestos_tasas",
      monto_neto_total: "100",
      trazabilidad: "indirecto",
      comportamiento: "fijo",
      driver: { tipo: "ventas_netas" }
    }];

    const result = calculate(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capas_resultado.find((layer) => layer.codigo === "resultado_neto_estimado")?.estado).toBe("calculado");
    expect(result.resultados_item[0]?.resultado_neto_estimado).toBe("900");
    expect(result.resultados_item[0]).toMatchObject({
      resultado_operativo_trazabilidad: "1000",
      costo_directo_unitario: "100",
      costo_indirecto_unitario: "10",
      costo_completo_unitario_gerencial: "110"
    });
  });

  it("serializa objetos canónicamente para snapshots reproducibles", () => {
    expect(canonicalStringify({ z: 1, nested: { b: 2, a: 1 }, a: 2 })).toBe('{"a":2,"nested":{"a":1,"b":2},"z":1}');
  });
});
