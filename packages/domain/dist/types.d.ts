export type DecimalString = string;
export type TipoActividad = "fabricacion" | "reventa" | "mixto";
export type ObjetivoCosteo = "conocer_costos" | "analizar_rentabilidad" | "ambos";
export type MadurezDatos = "inicial" | "intermedia" | "ordenada";
export type CondicionFiscal = "responsable_inscripto" | "monotributista" | "exento";
export interface BusinessConfigurationInput {
    tipo_actividad: TipoActividad;
    objetivo: ObjetivoCosteo;
    madurez_datos: MadurezDatos;
    condicion_fiscal: CondicionFiscal;
    canal_default: "venta_general";
    importes_sin_iva: true;
    alicuota_impuesto_resultado?: DecimalString;
}
export type TipoItem = "materia_prima" | "insumo" | "mercaderia_reventa" | "producto_intermedio" | "producto_final" | "envase_embalaje" | "consumible" | "subproducto_recupero";
export type OrigenItem = "comprado" | "fabricado" | "mixto" | "generado_subproducto";
export type TratamientoIva = "computable" | "integra_costo" | "no_aplica";
export type ComportamientoCosto = "fijo" | "variable";
export type TrazabilidadCosto = "directo" | "indirecto";
export type DriverKind = "manual" | "costo_directo" | "ventas_netas" | "unidades_vendidas" | "horas_mod" | "uniforme";
export interface CompraInput {
    compra_id: string;
    cantidad_base: DecimalString;
    precio_neto_unitario: DecimalString;
    costo_adquisicion_neto_total?: DecimalString;
}
export interface FuentesFallbackInput {
    historico_archivo?: DecimalString;
    manual?: DecimalString;
    presupuestado?: DecimalString;
}
export interface RecetaItemInput {
    item_componente_id: string;
    cantidad_neta: DecimalString;
    merma_estandar: DecimalString;
    factor_conversion_snapshot?: DecimalString;
}
export interface RecetaInput {
    cantidad_salida_base: DecimalString;
    componentes: RecetaItemInput[];
}
export interface ManoObraInput {
    rol_id: string;
    horas_estandar: DecimalString;
    costo_hora_completo: DecimalString;
    comportamiento: ComportamientoCosto;
}
export interface VentaInput {
    cantidad_base: DecimalString;
    precio_neto_unitario: DecimalString;
    descuento_neto_total?: DecimalString;
}
export interface ItemInput {
    item_id: string;
    codigo: string;
    nombre: string;
    tipo_item: TipoItem;
    origen_item: OrigenItem;
    vendible: boolean;
    inventariable: boolean;
    unidad_base_id: string;
    unidad_descripcion?: string;
    activo?: boolean;
    compras?: CompraInput[];
    fuentes_fallback?: FuentesFallbackInput;
    receta?: RecetaInput;
    mano_obra?: ManoObraInput[];
    participacion_comprada?: DecimalString;
    venta?: VentaInput;
}
export interface DriverInput {
    tipo: DriverKind;
    bases_manuales?: Record<string, DecimalString>;
}
export interface CostoInput {
    costo_id: string;
    nombre: string;
    categoria: string;
    monto_neto_total: DecimalString;
    trazabilidad: TrazabilidadCosto;
    comportamiento: ComportamientoCosto;
    item_directo_id?: string;
    alcance_item_ids?: string[];
    driver?: DriverInput;
}
export interface CalculationInput {
    schema_version: "2026-07-31.beta2";
    calculation_id: string;
    configuracion: BusinessConfigurationInput;
    moneda_base: string;
    tolerancia_conciliacion?: DecimalString;
    capacidad_normal_horas?: DecimalString;
    horas_mod_disponibles?: DecimalString;
    items: ItemInput[];
    costos: CostoInput[];
}
export type ValidationSeverity = "error_bloqueante" | "advertencia_metodologica" | "alerta_calidad" | "recomendacion_mejora" | "alerta_operativa";
export type ValidationPhase = "captura" | "importacion" | "normalizacion" | "pre_calculo" | "calculo" | "post_calculo" | "gobierno" | "seguridad" | "exportacion" | "operacion";
export interface ValidationIssue {
    codigo: string;
    severidad: ValidationSeverity;
    fase: ValidationPhase;
    mensaje: string;
    alcance_bloqueado: string;
    remediacion: string;
    formula_ids?: string[];
    source_path?: string;
    diferencia?: DecimalString;
    detalle?: Record<string, unknown>;
}
export interface MaterialComponentResult {
    item_componente_id: string;
    cantidad_bruta: DecimalString;
    costo_unitario_componente: DecimalString;
    costo_material_unitario: DecimalString;
}
export interface ItemCostResult {
    item_id: string;
    costo_unitario_aplicable: DecimalString;
    costo_unitario_variable: DecimalString;
    costo_unitario_fijo: DecimalString;
    fuente_costo: "promedio_compras" | "historico_archivo" | "manual" | "presupuestado" | "fabricado" | "mixto";
    componentes_materiales: MaterialComponentResult[];
}
export interface AllocationResult {
    costo_id: string;
    item_id: string;
    driver_solicitado: DriverKind;
    driver_aplicado: DriverKind;
    naturaleza_asignacion: "directa" | "causal" | "convencional";
    base: DecimalString;
    ponderacion: DecimalString;
    monto_asignado: DecimalString;
}
export interface ItemResult {
    item_id: string;
    codigo: string;
    ventas_netas: DecimalString;
    unidades_vendidas_netas: DecimalString;
    costo_directo: DecimalString;
    costo_indirecto_operativo_asignado: DecimalString;
    costo_directo_unitario: DecimalString | null;
    costo_indirecto_unitario: DecimalString | null;
    costo_variable_total: DecimalString;
    costo_fijo_total: DecimalString;
    margen_bruto: DecimalString;
    contribucion_marginal: DecimalString;
    resultado_operativo_trazabilidad: DecimalString;
    resultado_operativo_comportamiento: DecimalString;
    margen_operativo_porcentual: DecimalString | null;
    costo_completo_unitario_gerencial: DecimalString | null;
    costo_productivo_normal_unitario: DecimalString | null;
    precio_umbral_contribucion_cero: DecimalString | null;
    impuesto_resultado_estimado: DecimalString | null;
    resultado_neto_estimado: DecimalString | null;
}
export type ResultLayerCode = "costo_directo" | "costo_productivo_normal" | "margen_bruto" | "contribucion_marginal" | "resultado_operativo" | "resultado_neto_estimado";
export interface ResultLayerStatus {
    codigo: ResultLayerCode;
    estado: "calculado" | "no_disponible";
    motivo?: string;
}
export interface CapacityResult {
    horas_normales: DecimalString;
    horas_aplicadas: DecimalString;
    costo_fijo_productivo: DecimalString;
    tasa_fija_productiva_normal: DecimalString;
    costo_fijo_absorbido: DecimalString;
    variacion_capacidad: DecimalString;
}
export interface LaborEfficiencyResult {
    horas_disponibles: DecimalString;
    horas_ocupadas: DecimalString;
    cociente_ocupacion: DecimalString;
}
export interface ReconciliationResult {
    costos_cargados: DecimalString;
    costos_asignados: DecimalString;
    diferencia_costos: DecimalString;
    resultado_trazabilidad: DecimalString;
    resultado_comportamiento: DecimalString;
    diferencia_vistas: DecimalString;
    tolerancia: DecimalString;
    conciliado: boolean;
}
export interface IncomeStatementResult {
    ingresos_ventas: DecimalString;
    costos_directos: DecimalString;
    margen_bruto: DecimalString;
    gastos_operativos: DecimalString;
    gastos_administrativos: DecimalString;
    gastos_comerciales: DecimalString;
    gastos_logisticos: DecimalString;
    margen_operativo: DecimalString;
    impuestos: DecimalString;
    impuesto_ganancias_estimado: DecimalString;
    gastos_financieros: DecimalString;
    amortizaciones: DecimalString;
    margen_neto: DecimalString;
}
export interface CalculationSuccess {
    ok: true;
    engine_version: "0.2.0";
    schema_version: "2026-07-31.beta2";
    calculation_id: string;
    moneda_base: string;
    orden_costeo: string[];
    costos_item: ItemCostResult[];
    asignaciones: AllocationResult[];
    resultados_item: ItemResult[];
    estado_resultados: IncomeStatementResult;
    resultado_empresa: DecimalString;
    resultado_neto_empresa_estimado: DecimalString | null;
    capas_resultado: ResultLayerStatus[];
    capacidad: CapacityResult | null;
    eficiencia_mod: LaborEfficiencyResult | null;
    conciliacion: ReconciliationResult;
    validaciones: ValidationIssue[];
}
export interface CalculationFailure {
    ok: false;
    engine_version: "0.2.0";
    schema_version: "2026-07-31.beta2";
    calculation_id: string;
    validaciones: ValidationIssue[];
}
export type CalculationOutcome = CalculationSuccess | CalculationFailure;
