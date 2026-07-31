import { z } from "zod";
import type { CalculationInput } from "@costeo/domain";
export declare const calculationInputSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<"2026-07-27.beta1">;
    calculation_id: z.ZodString;
    moneda_base: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    tolerancia_conciliacion: z.ZodOptional<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        item_id: z.ZodString;
        codigo: z.ZodString;
        nombre: z.ZodString;
        tipo_item: z.ZodEnum<{
            materia_prima: "materia_prima";
            insumo: "insumo";
            mercaderia_reventa: "mercaderia_reventa";
            producto_intermedio: "producto_intermedio";
            producto_final: "producto_final";
            envase_embalaje: "envase_embalaje";
            consumible: "consumible";
            subproducto_recupero: "subproducto_recupero";
        }>;
        origen_item: z.ZodEnum<{
            comprado: "comprado";
            fabricado: "fabricado";
            mixto: "mixto";
            generado_subproducto: "generado_subproducto";
        }>;
        vendible: z.ZodBoolean;
        inventariable: z.ZodBoolean;
        unidad_base_id: z.ZodString;
        activo: z.ZodOptional<z.ZodBoolean>;
        compras: z.ZodOptional<z.ZodArray<z.ZodObject<{
            compra_id: z.ZodString;
            cantidad_base: z.ZodString;
            precio_bruto_unitario: z.ZodString;
            alicuota_iva: z.ZodString;
            tratamiento_iva: z.ZodEnum<{
                computable: "computable";
                integra_costo: "integra_costo";
                no_aplica: "no_aplica";
            }>;
            costo_adquisicion_directo_total: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        fuentes_fallback: z.ZodOptional<z.ZodObject<{
            historico_archivo: z.ZodOptional<z.ZodString>;
            manual: z.ZodOptional<z.ZodString>;
            presupuestado: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        receta: z.ZodOptional<z.ZodObject<{
            cantidad_salida_base: z.ZodString;
            componentes: z.ZodArray<z.ZodObject<{
                item_componente_id: z.ZodString;
                cantidad_neta: z.ZodString;
                merma_estandar: z.ZodString;
                factor_conversion_snapshot: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
        mano_obra: z.ZodOptional<z.ZodArray<z.ZodObject<{
            rol_id: z.ZodString;
            horas_estandar: z.ZodString;
            costo_hora_completo: z.ZodString;
            comportamiento: z.ZodEnum<{
                fijo: "fijo";
                variable: "variable";
            }>;
        }, z.core.$strict>>>;
        participacion_comprada: z.ZodOptional<z.ZodString>;
        venta: z.ZodOptional<z.ZodObject<{
            cantidad_base: z.ZodString;
            precio_bruto_unitario: z.ZodString;
            alicuota_iva: z.ZodString;
            tratamiento_iva: z.ZodOptional<z.ZodEnum<{
                computable: "computable";
                integra_costo: "integra_costo";
                no_aplica: "no_aplica";
            }>>;
            descuento_bruto_total: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    costos: z.ZodArray<z.ZodObject<{
        costo_id: z.ZodString;
        nombre: z.ZodString;
        categoria: z.ZodString;
        monto_total: z.ZodString;
        trazabilidad: z.ZodEnum<{
            directo: "directo";
            indirecto: "indirecto";
        }>;
        comportamiento: z.ZodEnum<{
            fijo: "fijo";
            variable: "variable";
        }>;
        item_directo_id: z.ZodOptional<z.ZodString>;
        alcance_item_ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
        driver: z.ZodOptional<z.ZodObject<{
            tipo: z.ZodEnum<{
                manual: "manual";
                costo_directo: "costo_directo";
                ventas_netas: "ventas_netas";
                unidades_vendidas: "unidades_vendidas";
                uniforme: "uniforme";
            }>;
            bases_manuales: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare function parseCalculationInput(value: unknown): CalculationInput;
export declare const apiErrorSchema: z.ZodObject<{
    error: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
