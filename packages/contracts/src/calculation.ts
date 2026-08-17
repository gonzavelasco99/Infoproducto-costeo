import { z } from "zod";
import { D } from "@costeo/domain";
import type { CalculationInput, CondicionFiscal, TipoActividad } from "@costeo/domain";

const decimal = z
  .string()
  .trim()
  .min(1)
  .regex(/^-?(?:\d+\.?\d*|\.\d+)$/, "Debe ser una cadena decimal, no un número IEEE-754.");
const uuid = z.string().uuid();

const configurationSchema = z.object({
  tipo_actividad: z.enum(["fabricacion", "reventa", "mixto"]),
  objetivo: z.enum(["conocer_costos", "analizar_rentabilidad", "ambos"]),
  madurez_datos: z.enum(["inicial", "intermedia", "ordenada"]),
  condicion_fiscal: z.enum(["responsable_inscripto", "monotributista", "exento"]),
  canal_default: z.literal("venta_general"),
  importes_sin_iva: z.literal(true),
  alicuota_impuesto_resultado: decimal.optional(),
  total_salarios_operarios_periodo: decimal.optional(),
  cantidad_operarios: decimal.optional(),
  horas_contratadas_operario_promedio: decimal.optional()
}).strict();

const compraSchema = z.object({
  compra_id: uuid,
  cantidad_base: decimal,
  precio_neto_unitario: decimal,
  costo_adquisicion_neto_total: decimal.optional()
}).strict();

const recetaItemSchema = z.object({
  item_componente_id: uuid,
  cantidad_neta: decimal,
  merma_estandar: decimal,
  factor_conversion_snapshot: decimal.optional()
}).strict();

const ventaSchema = z.object({
  cantidad_base: decimal,
  precio_neto_unitario: decimal,
  descuento_neto_total: decimal.optional()
}).strict();

const laborSchema = z.object({
  rol_id: uuid,
  horas_estandar: decimal,
  costo_hora_completo: decimal,
  comportamiento: z.enum(["fijo", "variable"])
}).strict();

const itemBaseShape = {
  item_id: uuid,
  codigo: z.string().trim().min(1).max(80),
  nombre: z.string().trim().min(1).max(180),
  tipo_item: z.enum([
    "materia_prima",
    "insumo",
    "mercaderia_reventa",
    "producto_intermedio",
    "producto_final",
    "envase_embalaje",
    "consumible",
    "subproducto_recupero"
  ]),
  origen_item: z.enum(["comprado", "fabricado", "mixto", "generado_subproducto"]),
  vendible: z.boolean(),
  inventariable: z.boolean(),
  unidad_base_id: uuid,
  unidad_descripcion: z.string().trim().min(1).max(40).optional(),
  activo: z.boolean().optional(),
  fuentes_fallback: z.object({
    historico_archivo: decimal.optional(),
    manual: decimal.optional(),
    presupuestado: decimal.optional()
  }).strict().optional(),
  receta: z.object({
    cantidad_salida_base: decimal,
    componentes: z.array(recetaItemSchema).max(20)
  }).strict().optional(),
  mano_obra: z.array(laborSchema).optional(),
  participacion_comprada: decimal.optional()
};

const itemSchema = z.object({
  ...itemBaseShape,
  compras: z.array(compraSchema).optional(),
  venta: ventaSchema.optional()
}).strict();

const driverSchema = z.object({
  tipo: z.enum(["manual", "costo_directo", "ventas_netas", "unidades_vendidas", "horas_mod", "uniforme"]),
  bases_manuales: z.record(uuid, decimal).optional()
}).strict();

const costoSchema = z.object({
  costo_id: uuid,
  nombre: z.string().trim().min(1).max(180),
  categoria: z.string().trim().min(1).max(80),
  monto_neto_total: decimal,
  trazabilidad: z.enum(["directo", "indirecto"]),
  comportamiento: z.enum(["fijo", "variable"]),
  item_directo_id: uuid.optional(),
  alcance_item_ids: z.array(uuid).optional(),
  driver: driverSchema.optional()
}).strict();

export const calculationInputSchema = z.object({
  schema_version: z.literal("2026-07-31.beta2"),
  calculation_id: uuid,
  configuracion: configurationSchema,
  moneda_base: z.string().length(3).transform((value) => value.toUpperCase()),
  tolerancia_conciliacion: decimal.optional(),
  capacidad_normal_horas: decimal.optional(),
  horas_mod_disponibles: decimal.optional(),
  items: z.array(itemSchema).min(1).max(100),
  costos: z.array(costoSchema).max(200)
}).strict();

const legacyPurchaseSchema = z.object({
  compra_id: uuid,
  cantidad_base: decimal,
  precio_bruto_unitario: decimal,
  alicuota_iva: decimal,
  tratamiento_iva: z.enum(["computable", "integra_costo", "no_aplica"]),
  costo_adquisicion_directo_total: decimal.optional()
}).strict();

const legacySaleSchema = z.object({
  cantidad_base: decimal,
  precio_bruto_unitario: decimal,
  alicuota_iva: decimal,
  tratamiento_iva: z.enum(["computable", "integra_costo", "no_aplica"]).optional(),
  descuento_bruto_total: decimal.optional()
}).strict();

const legacyItemSchema = z.object({
  ...itemBaseShape,
  compras: z.array(legacyPurchaseSchema).optional(),
  venta: legacySaleSchema.optional()
}).strict();

const legacyCostSchema = z.object({
  costo_id: uuid,
  nombre: z.string().trim().min(1).max(180),
  categoria: z.string().trim().min(1).max(80),
  monto_total: decimal,
  trazabilidad: z.enum(["directo", "indirecto"]),
  comportamiento: z.enum(["fijo", "variable"]),
  item_directo_id: uuid.optional(),
  alcance_item_ids: z.array(uuid).optional(),
  driver: z.object({
    tipo: z.enum(["manual", "costo_directo", "ventas_netas", "unidades_vendidas", "uniforme"]),
    bases_manuales: z.record(uuid, decimal).optional()
  }).strict().optional()
}).strict();

const legacyCalculationInputSchema = z.object({
  schema_version: z.literal("2026-07-27.beta1"),
  calculation_id: uuid,
  moneda_base: z.string().length(3),
  tolerancia_conciliacion: decimal.optional(),
  items: z.array(legacyItemSchema).min(1).max(100),
  costos: z.array(legacyCostSchema).max(200)
}).strict();

function legacyEconomicAmount(gross: string, rate: string, treatment: "computable" | "integra_costo" | "no_aplica"): string {
  if (treatment !== "computable") return D(gross).toString();
  return D(gross).div(D(1).plus(D(rate))).toString();
}

function inferActivity(items: z.infer<typeof legacyItemSchema>[]): TipoActividad {
  const origins = new Set(items.filter((item) => item.vendible).map((item) => item.origen_item));
  if (origins.has("mixto") || (origins.has("fabricado") && origins.has("comprado"))) return "mixto";
  return origins.has("fabricado") ? "fabricacion" : "reventa";
}

export function migrateLegacyCalculationInput(value: unknown): CalculationInput {
  const legacy = legacyCalculationInputSchema.parse(value);
  const condicionFiscal: CondicionFiscal = "responsable_inscripto";
  const migrated = {
    schema_version: "2026-07-31.beta2",
    calculation_id: legacy.calculation_id,
    configuracion: {
      tipo_actividad: inferActivity(legacy.items),
      objetivo: "ambos",
      madurez_datos: "intermedia",
      condicion_fiscal: condicionFiscal,
      canal_default: "venta_general",
      importes_sin_iva: true
    },
    moneda_base: legacy.moneda_base.toUpperCase(),
    ...(legacy.tolerancia_conciliacion === undefined ? {} : { tolerancia_conciliacion: legacy.tolerancia_conciliacion }),
    items: legacy.items.map((item) => ({
      ...item,
      compras: item.compras?.map((purchase) => ({
        compra_id: purchase.compra_id,
        cantidad_base: purchase.cantidad_base,
        precio_neto_unitario: legacyEconomicAmount(purchase.precio_bruto_unitario, purchase.alicuota_iva, purchase.tratamiento_iva),
        ...(purchase.costo_adquisicion_directo_total === undefined
          ? {}
          : { costo_adquisicion_neto_total: purchase.costo_adquisicion_directo_total })
      })),
      venta: item.venta === undefined ? undefined : {
        cantidad_base: item.venta.cantidad_base,
        precio_neto_unitario: legacyEconomicAmount(
          item.venta.precio_bruto_unitario,
          item.venta.alicuota_iva,
          item.venta.tratamiento_iva ?? "computable"
        ),
        ...(item.venta.descuento_bruto_total === undefined
          ? {}
          : {
              descuento_neto_total: legacyEconomicAmount(
                item.venta.descuento_bruto_total,
                item.venta.alicuota_iva,
                item.venta.tratamiento_iva ?? "computable"
              )
            })
      }
    })),
    costos: legacy.costos.map((cost) => ({
      ...cost,
      monto_neto_total: cost.monto_total,
      monto_total: undefined
    })).map(({ monto_total: _legacyAmount, ...cost }) => cost)
  };
  return calculationInputSchema.parse(migrated) as CalculationInput;
}

export function parseCalculationInput(value: unknown): CalculationInput {
  return calculationInputSchema.parse(value) as CalculationInput;
}

export function parseCalculationInputWithMigration(value: unknown): CalculationInput {
  const version = typeof value === "object" && value !== null && "schema_version" in value
    ? (value as { schema_version?: unknown }).schema_version
    : undefined;
  return version === "2026-07-27.beta1" ? migrateLegacyCalculationInput(value) : parseCalculationInput(value);
}

export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional()
}).strict();
