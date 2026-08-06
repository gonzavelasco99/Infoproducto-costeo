import { D, Decimal, ONE, ZERO, decimalString, sum } from "./decimal.js";
import { validateCalculationInput } from "./validation.js";
import type {
  AllocationResult,
  CapacityResult,
  CalculationInput,
  CalculationOutcome,
  CalculationSuccess,
  CostoInput,
  DriverKind,
  ItemCostResult,
  ItemInput,
  ItemResult,
  MaterialComponentResult,
  ResultLayerStatus,
  ValidationIssue
} from "./types.js";

export const ENGINE_VERSION = "0.2.0" as const;
export const SCHEMA_VERSION = "2026-07-31.beta2" as const;

interface InternalUnitCost {
  total: Decimal;
  variable: Decimal;
  fixed: Decimal;
  source: ItemCostResult["fuente_costo"];
  components: MaterialComponentResult[];
}

interface InternalItemResult {
  item: ItemInput;
  sales: Decimal;
  units: Decimal;
  direct: Decimal;
  indirect: Decimal;
  variable: Decimal;
  fixed: Decimal;
  laborHours: Decimal;
}

export function decomposeGross(gross: Decimal, vatRate: Decimal): { net: Decimal; vat: Decimal } {
  const net = gross.div(ONE.plus(vatRate));
  return { net, vat: gross.minus(net) };
}

function purchasedCost(item: ItemInput): InternalUnitCost | undefined {
  if (item.compras && item.compras.length > 0) {
    let quantity = ZERO;
    let total = ZERO;
    for (const purchase of item.compras) {
      const q = D(purchase.cantidad_base);
      const economicUnit = D(purchase.precio_neto_unitario);
      const acquisitionUnit = D(purchase.costo_adquisicion_neto_total ?? 0).div(q);
      quantity = quantity.plus(q);
      total = total.plus(economicUnit.plus(acquisitionUnit).times(q));
    }
    const unit = total.div(quantity);
    return { total: unit, variable: unit, fixed: ZERO, source: "promedio_compras", components: [] };
  }
  const candidates: Array<[ItemCostResult["fuente_costo"], string | undefined]> = [
    ["historico_archivo", item.fuentes_fallback?.historico_archivo],
    ["manual", item.fuentes_fallback?.manual],
    ["presupuestado", item.fuentes_fallback?.presupuestado]
  ];
  const selected = candidates.find(([, value]) => value !== undefined);
  if (!selected || selected[1] === undefined) return undefined;
  const unit = D(selected[1]);
  return { total: unit, variable: unit, fixed: ZERO, source: selected[0], components: [] };
}

function topologicalOrder(items: ItemInput[]): string[] {
  const byId = new Map(items.map((item) => [item.item_id, item]));
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (itemId: string): void => {
    if (visited.has(itemId)) return;
    visited.add(itemId);
    const item = byId.get(itemId);
    for (const component of item?.receta?.componentes ?? []) visit(component.item_componente_id);
    order.push(itemId);
  };
  for (const item of items) visit(item.item_id);
  return order;
}

function buildUnitCosts(items: ItemInput[], order: string[]): { costs: Map<string, InternalUnitCost>; issues: ValidationIssue[] } {
  const byId = new Map(items.map((item) => [item.item_id, item]));
  const costs = new Map<string, InternalUnitCost>();
  const issues: ValidationIssue[] = [];

  for (const itemId of order) {
    const item = byId.get(itemId);
    if (!item) continue;
    const bought = purchasedCost(item);
    let fabricated: InternalUnitCost | undefined;
    if (item.receta) {
      const outputQuantity = D(item.receta.cantidad_salida_base);
      let variable = ZERO;
      let fixed = ZERO;
      const components: MaterialComponentResult[] = [];
      for (const component of item.receta.componentes) {
        const componentCost = costs.get(component.item_componente_id);
        if (!componentCost) {
          issues.push({
            codigo: "VAL-BOM-006",
            severidad: "error_bloqueante",
            fase: "pre_calculo",
            mensaje: "Un componente intermedio no tiene una fuente de costo aplicable.",
            alcance_bloqueado: "ítem y resultados dependientes",
            remediacion: "Completá una compra o una fuente alternativa para el componente.",
            formula_ids: ["MAT-003", "INT-001"],
            source_path: `/items/${itemId}/receta/componentes/${component.item_componente_id}`
          });
          continue;
        }
        const netBase = D(component.cantidad_neta).times(D(component.factor_conversion_snapshot ?? 1));
        const gross = netBase.div(ONE.minus(D(component.merma_estandar)));
        const materialTotal = gross.times(componentCost.total).div(outputQuantity);
        variable = variable.plus(gross.times(componentCost.variable).div(outputQuantity));
        fixed = fixed.plus(gross.times(componentCost.fixed).div(outputQuantity));
        components.push({
          item_componente_id: component.item_componente_id,
          cantidad_bruta: decimalString(gross),
          costo_unitario_componente: decimalString(componentCost.total),
          costo_material_unitario: decimalString(materialTotal)
        });
      }
      for (const labor of item.mano_obra ?? []) {
        const laborCost = D(labor.horas_estandar).times(D(labor.costo_hora_completo));
        if (labor.comportamiento === "variable") variable = variable.plus(laborCost);
        else fixed = fixed.plus(laborCost);
      }
      fabricated = { total: variable.plus(fixed), variable, fixed, source: "fabricado", components };
    }

    if (item.origen_item === "comprado" && bought) costs.set(itemId, bought);
    else if (item.origen_item === "fabricado" && fabricated) costs.set(itemId, fabricated);
    else if (item.origen_item === "mixto" && bought && fabricated) {
      const purchasedShare = D(item.participacion_comprada ?? "0.5");
      const manufacturedShare = ONE.minus(purchasedShare);
      costs.set(itemId, {
        total: bought.total.times(purchasedShare).plus(fabricated.total.times(manufacturedShare)),
        variable: bought.variable.times(purchasedShare).plus(fabricated.variable.times(manufacturedShare)),
        fixed: bought.fixed.times(purchasedShare).plus(fabricated.fixed.times(manufacturedShare)),
        source: "mixto",
        components: fabricated.components
      });
    } else if (bought) costs.set(itemId, bought);
    else if (fabricated) costs.set(itemId, fabricated);
    else {
      issues.push({
        codigo: "VAL-DAT-001",
        severidad: "error_bloqueante",
        fase: "pre_calculo",
        mensaje: "No existe una fuente de costo aplicable para el ítem.",
        alcance_bloqueado: "ítem y resultados dependientes",
        remediacion: "Cargá una compra, un costo manual o una receta válida.",
        source_path: `/items/${itemId}`
      });
    }
  }
  return { costs, issues };
}

function saleTotals(item: ItemInput): { sales: Decimal; units: Decimal } {
  if (!item.venta) return { sales: ZERO, units: ZERO };
  const units = D(item.venta.cantidad_base);
  const net = units.times(D(item.venta.precio_neto_unitario));
  const discountNet = D(item.venta.descuento_neto_total ?? 0);
  return { sales: net.minus(discountNet), units };
}

function candidateBases(
  kind: DriverKind,
  cost: CostoInput,
  recipients: InternalItemResult[]
): Map<string, Decimal> | undefined {
  const values = new Map<string, Decimal>();
  for (const recipient of recipients) {
    let value: Decimal;
    if (kind === "manual") value = D(cost.driver?.bases_manuales?.[recipient.item.item_id] ?? -1);
    else if (kind === "costo_directo") value = recipient.direct;
    else if (kind === "ventas_netas") value = Decimal.max(recipient.sales, ZERO);
    else if (kind === "unidades_vendidas") value = recipient.units;
    else if (kind === "horas_mod") value = recipient.laborHours;
    else value = ONE;
    values.set(recipient.item.item_id, value);
  }
  const list = [...values.values()];
  if (list.some((value) => value.lt(0)) || sum(list).lte(0)) return undefined;
  return values;
}

function allocateIndirect(
  cost: CostoInput,
  itemResults: Map<string, InternalItemResult>,
  issues: ValidationIssue[]
): AllocationResult[] {
  const scope = new Set(cost.alcance_item_ids ?? [...itemResults.keys()]);
  const recipients = [...itemResults.values()].filter((entry) => entry.item.vendible && scope.has(entry.item.item_id));
  if (recipients.length === 0) {
    issues.push({
      codigo: "VAL-POOL-003",
      severidad: "error_bloqueante",
      fase: "pre_calculo",
      mensaje: "El costo indirecto no tiene receptores configurados.",
      alcance_bloqueado: "pool y resultado operativo",
      remediacion: "Asigná al menos un SKU receptor al costo.",
      formula_ids: ["ASG-006"],
      source_path: `/costos/${cost.costo_id}/alcance_item_ids`
    });
    return [];
  }
  const requested = cost.driver?.tipo ?? "uniforme";
  const candidates: DriverKind[] = [requested, "costo_directo", "ventas_netas", "unidades_vendidas", "uniforme"];
  const hierarchy = candidates.filter((value, index, values) => values.indexOf(value) === index);
  let applied: DriverKind | undefined;
  let bases: Map<string, Decimal> | undefined;
  for (const candidate of hierarchy) {
    const candidateValues = candidateBases(candidate, cost, recipients);
    if (candidateValues) {
      applied = candidate;
      bases = candidateValues;
      break;
    }
  }
  if (!applied || !bases) {
    issues.push({
      codigo: "VAL-DRV-002",
      severidad: "error_bloqueante",
      fase: "calculo",
      mensaje: "Las bases del driver deben ser no negativas y sumar más que cero.",
      alcance_bloqueado: "pool y resultado operativo",
      remediacion: "Elegí un driver con bases disponibles o completá las bases manuales.",
      formula_ids: ["ASG-001", "ASG-006"],
      source_path: `/costos/${cost.costo_id}/driver`
    });
    return [];
  }
  if (applied !== requested) {
    issues.push({
      codigo: applied === "uniforme" ? "VAL-DRV-006" : "VAL-DRV-005",
      severidad: "advertencia_metodologica",
      fase: "calculo",
      mensaje: `El driver ${requested} no fue aplicable; se utilizó ${applied}.`,
      alcance_bloqueado: "no bloquea; afecta la interpretación de la asignación",
      remediacion: "Revisá la disponibilidad de la base solicitada o aceptá explícitamente el fallback.",
      formula_ids: ["ASG-006"],
      source_path: `/costos/${cost.costo_id}/driver`,
      detalle: { solicitado: requested, aplicado: applied }
    });
  }
  const totalBase = sum(bases.values());
  const amount = D(cost.monto_neto_total);
  let assigned = ZERO;
  return recipients.map((recipient, index) => {
    const base = bases?.get(recipient.item.item_id) ?? ZERO;
    const weight = base.div(totalBase);
    const allocation = index === recipients.length - 1 ? amount.minus(assigned) : amount.times(weight);
    assigned = assigned.plus(allocation);
    recipient.indirect = recipient.indirect.plus(allocation);
    if (cost.comportamiento === "variable") recipient.variable = recipient.variable.plus(allocation);
    else recipient.fixed = recipient.fixed.plus(allocation);
    return {
      costo_id: cost.costo_id,
      item_id: recipient.item.item_id,
      driver_solicitado: requested,
      driver_aplicado: applied as DriverKind,
      naturaleza_asignacion: applied === "uniforme" ? "convencional" : "causal",
      base: decimalString(base),
      ponderacion: decimalString(weight),
      monto_asignado: decimalString(allocation)
    };
  });
}

function presentItemResult(entry: InternalItemResult, productiveRate: Decimal | undefined, taxRate: Decimal | undefined): ItemResult {
  const margin = entry.sales.minus(entry.direct);
  const contribution = entry.sales.minus(entry.variable);
  const traceResult = margin.minus(entry.indirect);
  const behaviorResult = contribution.minus(entry.fixed);
  const fullCost = entry.direct.plus(entry.indirect);
  const productiveNormalTotal = productiveRate === undefined ? undefined : entry.direct.plus(entry.laborHours.times(productiveRate));
  const estimatedTax = taxRate === undefined ? undefined : Decimal.max(traceResult, ZERO).times(taxRate);
  return {
    item_id: entry.item.item_id,
    codigo: entry.item.codigo,
    ventas_netas: decimalString(entry.sales),
    unidades_vendidas_netas: decimalString(entry.units),
    costo_directo: decimalString(entry.direct),
    costo_indirecto_operativo_asignado: decimalString(entry.indirect),
    costo_variable_total: decimalString(entry.variable),
    costo_fijo_total: decimalString(entry.fixed),
    margen_bruto: decimalString(margin),
    contribucion_marginal: decimalString(contribution),
    resultado_operativo_trazabilidad: decimalString(traceResult),
    resultado_operativo_comportamiento: decimalString(behaviorResult),
    margen_operativo_porcentual: entry.sales.gt(0) ? decimalString(traceResult.div(entry.sales)) : null,
    costo_completo_unitario_gerencial: entry.units.gt(0) ? decimalString(fullCost.div(entry.units)) : null,
    costo_productivo_normal_unitario: productiveNormalTotal !== undefined && entry.units.gt(0)
      ? decimalString(productiveNormalTotal.div(entry.units))
      : null,
    precio_umbral_contribucion_cero: entry.units.gt(0) ? decimalString(entry.variable.div(entry.units)) : null,
    impuesto_resultado_estimado: estimatedTax === undefined ? null : decimalString(estimatedTax),
    resultado_neto_estimado: estimatedTax === undefined ? null : decimalString(traceResult.minus(estimatedTax))
  };
}

export function calculate(input: CalculationInput): CalculationOutcome {
  const validationIssues = validateCalculationInput(input);
  if (validationIssues.some((entry) => entry.severidad === "error_bloqueante")) {
    return {
      ok: false,
      engine_version: ENGINE_VERSION,
      schema_version: SCHEMA_VERSION,
      calculation_id: input.calculation_id,
      validaciones: validationIssues
    };
  }

  const order = topologicalOrder(input.items);
  const { costs: unitCosts, issues: costingIssues } = buildUnitCosts(input.items, order);
  validationIssues.push(...costingIssues);
  if (costingIssues.some((entry) => entry.severidad === "error_bloqueante")) {
    return {
      ok: false,
      engine_version: ENGINE_VERSION,
      schema_version: SCHEMA_VERSION,
      calculation_id: input.calculation_id,
      validaciones: validationIssues
    };
  }

  const itemResults = new Map<string, InternalItemResult>();
  for (const item of input.items) {
    const sale = saleTotals(item);
    const unit = unitCosts.get(item.item_id) ?? { total: ZERO, variable: ZERO, fixed: ZERO };
    itemResults.set(item.item_id, {
      item,
      sales: sale.sales,
      units: sale.units,
      direct: unit.total.times(sale.units),
      indirect: ZERO,
      variable: unit.variable.times(sale.units),
      fixed: unit.fixed.times(sale.units),
      laborHours: sum((item.mano_obra ?? []).map((labor) => D(labor.horas_estandar))).times(sale.units)
    });
  }

  const allocations: AllocationResult[] = [];
  for (const cost of input.costos) {
    if (cost.trazabilidad === "directo" && cost.item_directo_id) {
      const target = itemResults.get(cost.item_directo_id);
      if (!target) continue;
      const amount = D(cost.monto_neto_total);
      target.direct = target.direct.plus(amount);
      if (cost.comportamiento === "variable") target.variable = target.variable.plus(amount);
      else target.fixed = target.fixed.plus(amount);
      allocations.push({
        costo_id: cost.costo_id,
        item_id: cost.item_directo_id,
        driver_solicitado: "manual",
        driver_aplicado: "manual",
        naturaleza_asignacion: "directa",
        base: "1",
        ponderacion: "1",
        monto_asignado: decimalString(amount)
      });
    } else {
      allocations.push(...allocateIndirect(cost, itemResults, validationIssues));
    }
  }

  if (validationIssues.some((entry) => entry.severidad === "error_bloqueante")) {
    return {
      ok: false,
      engine_version: ENGINE_VERSION,
      schema_version: SCHEMA_VERSION,
      calculation_id: input.calculation_id,
      validaciones: validationIssues
    };
  }

  const productiveFixed = sum(input.costos
    .filter((cost) => cost.categoria === "produccion" && cost.comportamiento === "fijo")
    .map((cost) => D(cost.monto_neto_total)));
  const normalHours = input.capacidad_normal_horas === undefined ? undefined : D(input.capacidad_normal_horas);
  const productiveRate = normalHours === undefined ? undefined : productiveFixed.div(normalHours);
  const appliedHours = sum([...itemResults.values()].filter((entry) => entry.item.vendible).map((entry) => entry.laborHours));
  const capacity: CapacityResult | null = normalHours === undefined || productiveRate === undefined
    ? null
    : {
        horas_normales: decimalString(normalHours),
        horas_aplicadas: decimalString(appliedHours),
        costo_fijo_productivo: decimalString(productiveFixed),
        tasa_fija_productiva_normal: decimalString(productiveRate),
        costo_fijo_absorbido: decimalString(appliedHours.times(productiveRate)),
        variacion_capacidad: decimalString(productiveFixed.minus(appliedHours.times(productiveRate)))
      };
  const taxRate = input.configuracion.alicuota_impuesto_resultado === undefined
    ? undefined
    : D(input.configuracion.alicuota_impuesto_resultado);
  const presented = [...itemResults.values()]
    .filter((entry) => entry.item.vendible)
    .map((entry) => presentItemResult(entry, productiveRate, taxRate));
  const totalCostsLoaded = sum(input.costos.map((cost) => D(cost.monto_neto_total))).plus(
    sum([...itemResults.values()].map((entry) => {
      const unit = unitCosts.get(entry.item.item_id);
      return unit ? unit.total.times(entry.units) : ZERO;
    }))
  );
  const totalAssigned = sum([...itemResults.values()].map((entry) => entry.direct.plus(entry.indirect)));
  const traceResult = sum([...itemResults.values()].map((entry) => entry.sales.minus(entry.direct).minus(entry.indirect)));
  const behaviorResult = sum([...itemResults.values()].map((entry) => entry.sales.minus(entry.variable).minus(entry.fixed)));
  const costDifference = totalCostsLoaded.minus(totalAssigned);
  const viewDifference = traceResult.minus(behaviorResult);
  const tolerance = D(input.tolerancia_conciliacion ?? "0.01");
  const reconciled = costDifference.abs().lte(tolerance) && viewDifference.abs().lte(tolerance);
  if (!reconciled) {
    validationIssues.push({
      codigo: "VAL-REC-001",
      severidad: "error_bloqueante",
      fase: "post_calculo",
      mensaje: "La diferencia de conciliación supera la tolerancia.",
      alcance_bloqueado: "corrida completa",
      remediacion: "Revisá asignaciones, signos y universos antes de usar los resultados.",
      formula_ids: ["REC-001", "REC-002", "REC-004"],
      diferencia: decimalString(Decimal.max(costDifference.abs(), viewDifference.abs())),
      detalle: { costo: decimalString(costDifference), vistas: decimalString(viewDifference) }
    });
    return {
      ok: false,
      engine_version: ENGINE_VERSION,
      schema_version: SCHEMA_VERSION,
      calculation_id: input.calculation_id,
      validaciones: validationIssues
    };
  }

  const resultLayers: ResultLayerStatus[] = [
    { codigo: "costo_directo", estado: "calculado" },
    productiveRate === undefined
      ? { codigo: "costo_productivo_normal", estado: "no_disponible", motivo: "Falta capacidad normal del período." }
      : { codigo: "costo_productivo_normal", estado: "calculado" },
    { codigo: "margen_bruto", estado: "calculado" },
    { codigo: "contribucion_marginal", estado: "calculado" },
    { codigo: "resultado_operativo", estado: "calculado" },
    taxRate === undefined
      ? { codigo: "resultado_neto_estimado", estado: "no_disponible", motivo: "No se informó una alícuota estimada de impuesto al resultado." }
      : { codigo: "resultado_neto_estimado", estado: "calculado" }
  ];
  const netCompany = taxRate === undefined
    ? null
    : decimalString(sum(presented.map((entry) => D(entry.resultado_neto_estimado ?? 0))));

  const result: CalculationSuccess = {
    ok: true,
    engine_version: ENGINE_VERSION,
    schema_version: SCHEMA_VERSION,
    calculation_id: input.calculation_id,
    moneda_base: input.moneda_base,
    orden_costeo: order,
    costos_item: order.map((itemId) => {
      const unit = unitCosts.get(itemId) as InternalUnitCost;
      return {
        item_id: itemId,
        costo_unitario_aplicable: decimalString(unit.total),
        costo_unitario_variable: decimalString(unit.variable),
        costo_unitario_fijo: decimalString(unit.fixed),
        fuente_costo: unit.source,
        componentes_materiales: unit.components
      };
    }),
    asignaciones: allocations,
    resultados_item: presented,
    resultado_empresa: decimalString(traceResult),
    resultado_neto_empresa_estimado: netCompany,
    capas_resultado: resultLayers,
    capacidad: capacity,
    conciliacion: {
      costos_cargados: decimalString(totalCostsLoaded),
      costos_asignados: decimalString(totalAssigned),
      diferencia_costos: decimalString(costDifference),
      resultado_trazabilidad: decimalString(traceResult),
      resultado_comportamiento: decimalString(behaviorResult),
      diferencia_vistas: decimalString(viewDifference),
      tolerancia: decimalString(tolerance),
      conciliado: reconciled
    },
    validaciones: validationIssues
  };
  return result;
}
