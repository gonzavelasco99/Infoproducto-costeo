import { D } from "./decimal.js";
const issue = (codigo, mensaje, source_path, detalle, options = {}) => ({
    codigo,
    severidad: options.severidad ?? "error_bloqueante",
    fase: options.fase ?? "captura",
    mensaje,
    alcance_bloqueado: options.alcance ?? "dato y resultados dependientes",
    remediacion: options.remediacion ?? "Corregí el dato indicado antes de volver a calcular.",
    ...(options.formula_ids === undefined ? {} : { formula_ids: options.formula_ids }),
    ...(source_path === undefined ? {} : { source_path }),
    ...(detalle === undefined ? {} : { detalle })
});
function isValidDecimal(value) {
    if (value === undefined || value.trim() === "")
        return false;
    try {
        return D(value).isFinite();
    }
    catch {
        return false;
    }
}
function validateDecimal(value, path, issues, options = {}) {
    if (!isValidDecimal(value)) {
        issues.push(issue("VAL-DAT-002", "El valor debe ser un decimal finito serializado como texto.", path));
        return;
    }
    const decimal = D(value);
    if (options.positive ? decimal.lte(0) : decimal.lt(0)) {
        issues.push(issue("VAL-DAT-002", options.positive ? "El valor debe ser mayor que cero." : "El valor no puede ser negativo.", path));
    }
    if (options.rate && decimal.gte(1)) {
        issues.push(issue("VAL-DAT-002", "La tasa debe expresarse como fracción entre 0 y 1.", path));
    }
}
function validateItem(item, index, itemsById, issues) {
    const base = `/items/${index}`;
    if (!item.item_id || !item.codigo.trim() || !item.nombre.trim()) {
        issues.push(issue("VAL-DAT-001", "Faltan identificador, código o nombre obligatorios.", base));
    }
    if (!item.unidad_base_id) {
        issues.push(issue("VAL-UNT-001", "Todo ítem debe tener una unidad base activa.", `${base}/unidad_base_id`));
    }
    if (item.vendible && item.tipo_item === "subproducto_recupero") {
        issues.push(issue("VAL-ITEM-001", "Un subproducto de recupero no participa como venta ordinaria.", `${base}/vendible`));
    }
    if ((item.origen_item === "fabricado" || item.origen_item === "mixto") && !item.receta) {
        issues.push(issue("VAL-DAT-001", "Un ítem fabricado o mixto requiere receta para este nivel de cálculo.", `${base}/receta`));
    }
    if (item.origen_item === "comprado" || item.origen_item === "mixto") {
        if ((item.compras?.length ?? 0) === 0 && !item.fuentes_fallback) {
            issues.push(issue("VAL-DAT-001", "El ítem comprado requiere compras o una fuente de costo fallback.", `${base}/compras`));
        }
    }
    if (item.participacion_comprada !== undefined) {
        if (!isValidDecimal(item.participacion_comprada) || D(item.participacion_comprada).lt(0) || D(item.participacion_comprada).gt(1)) {
            issues.push(issue("VAL-DAT-002", "La participación comprada debe estar entre 0 y 1 inclusive.", `${base}/participacion_comprada`));
        }
    }
    for (const [source, value] of Object.entries(item.fuentes_fallback ?? {})) {
        validateDecimal(value, `${base}/fuentes_fallback/${source}`, issues);
    }
    item.compras?.forEach((compra, compraIndex) => {
        const compraPath = `${base}/compras/${compraIndex}`;
        validateDecimal(compra.cantidad_base, `${compraPath}/cantidad_base`, issues, { positive: true });
        validateDecimal(compra.precio_neto_unitario, `${compraPath}/precio_neto_unitario`, issues);
        if (compra.costo_adquisicion_neto_total !== undefined) {
            validateDecimal(compra.costo_adquisicion_neto_total, `${compraPath}/costo_adquisicion_neto_total`, issues);
        }
    });
    if (item.receta) {
        validateDecimal(item.receta.cantidad_salida_base, `${base}/receta/cantidad_salida_base`, issues, { positive: true });
        if (item.receta.componentes.length > 20) {
            issues.push(issue("VAL-LIM-003", "La receta del tier gratuito admite como máximo veinte materiales.", `${base}/receta/componentes`));
        }
        const seen = new Set();
        item.receta.componentes.forEach((component, componentIndex) => {
            const componentPath = `${base}/receta/componentes/${componentIndex}`;
            if (component.item_componente_id === item.item_id) {
                issues.push(issue("VAL-BOM-002", "Un ítem no puede incluirse directamente en su propia receta.", `${componentPath}/item_componente_id`));
            }
            if (!itemsById.has(component.item_componente_id)) {
                issues.push(issue("VAL-DAT-004", "El componente de la receta no existe en el conjunto de ítems.", `${componentPath}/item_componente_id`));
            }
            if (seen.has(component.item_componente_id)) {
                issues.push(issue("VAL-BOM-004", "El componente está repetido en la receta.", componentPath));
            }
            seen.add(component.item_componente_id);
            validateDecimal(component.cantidad_neta, `${componentPath}/cantidad_neta`, issues, { positive: true });
            validateDecimal(component.merma_estandar, `${componentPath}/merma_estandar`, issues, { rate: true });
            if (component.factor_conversion_snapshot !== undefined) {
                validateDecimal(component.factor_conversion_snapshot, `${componentPath}/factor_conversion_snapshot`, issues, { positive: true });
            }
        });
    }
    item.mano_obra?.forEach((labor, laborIndex) => {
        validateDecimal(labor.horas_estandar, `${base}/mano_obra/${laborIndex}/horas_estandar`, issues);
        validateDecimal(labor.costo_hora_completo, `${base}/mano_obra/${laborIndex}/costo_hora_completo`, issues);
    });
    if (item.venta) {
        if (!item.vendible) {
            issues.push(issue("VAL-ITEM-002", "Solo un ítem vendible puede registrar ventas ordinarias.", `${base}/venta`));
        }
        validateDecimal(item.venta.cantidad_base, `${base}/venta/cantidad_base`, issues);
        validateDecimal(item.venta.precio_neto_unitario, `${base}/venta/precio_neto_unitario`, issues);
        if (item.venta.descuento_neto_total !== undefined) {
            validateDecimal(item.venta.descuento_neto_total, `${base}/venta/descuento_neto_total`, issues);
        }
    }
}
function validateGraph(itemsById, issues) {
    const state = new Map();
    const depthMemo = new Map();
    const stack = [];
    let cycleReported = false;
    const visit = (itemId) => {
        const currentState = state.get(itemId);
        if (currentState === "visiting") {
            if (!cycleReported) {
                const start = stack.indexOf(itemId);
                const cycle = [...stack.slice(start), itemId];
                issues.push(issue("VAL-BOM-001", "La estructura BOM contiene un ciclo.", "/items", { cycle }));
                cycleReported = true;
            }
            return 0;
        }
        if (currentState === "visited")
            return depthMemo.get(itemId) ?? 0;
        state.set(itemId, "visiting");
        stack.push(itemId);
        const item = itemsById.get(itemId);
        let depth = 0;
        for (const component of item?.receta?.componentes ?? []) {
            const child = itemsById.get(component.item_componente_id);
            if (child?.receta)
                depth = Math.max(depth, 1 + visit(child.item_id));
        }
        stack.pop();
        state.set(itemId, "visited");
        depthMemo.set(itemId, depth);
        return depth;
    };
    for (const item of itemsById.values()) {
        const depth = visit(item.item_id);
        if (depth > 1) {
            issues.push(issue("VAL-BOM-007", "El tier gratuito admite final → intermedio → comprado como profundidad máxima.", `/items/${item.item_id}/receta`, { depth_edges: depth + 1 }));
        }
    }
}
export function validateCalculationInput(input) {
    const issues = [];
    const sellableOrigins = input.items.filter((item) => item.vendible && item.activo !== false).map((item) => item.origen_item);
    if (input.configuracion.tipo_actividad === "fabricacion" && sellableOrigins.some((origin) => origin === "comprado")) {
        issues.push(issue("VAL-DAT-001", "La configuración de fabricación no admite SKU de reventa.", "/configuracion/tipo_actividad", undefined, { remediacion: "Cambiá la actividad a mixta o definí el SKU como fabricado." }));
    }
    if (input.configuracion.tipo_actividad === "reventa" && sellableOrigins.some((origin) => origin !== "comprado")) {
        issues.push(issue("VAL-DAT-001", "La configuración de reventa no admite SKU fabricados o mixtos.", "/configuracion/tipo_actividad", undefined, { remediacion: "Cambiá la actividad a mixta o definí el SKU como comprado." }));
    }
    if (input.configuracion.alicuota_impuesto_resultado !== undefined) {
        validateDecimal(input.configuracion.alicuota_impuesto_resultado, "/configuracion/alicuota_impuesto_resultado", issues, { rate: true });
    }
    const laborConfiguration = [
        input.configuracion.total_salarios_operarios_periodo,
        input.configuracion.cantidad_operarios,
        input.configuracion.horas_contratadas_operario_promedio
    ];
    if (laborConfiguration.some((value) => value !== undefined)) {
        if (laborConfiguration.some((value) => value === undefined)) {
            issues.push(issue("VAL-MOD-003", "Para calcular la MOD deben informarse el total de salarios, la cantidad de operarios y sus horas contratadas promedio.", "/configuracion", undefined, { remediacion: "Completá los tres datos de mano de obra en la configuración del negocio." }));
        }
        validateDecimal(input.configuracion.total_salarios_operarios_periodo, "/configuracion/total_salarios_operarios_periodo", issues, { positive: true });
        validateDecimal(input.configuracion.cantidad_operarios, "/configuracion/cantidad_operarios", issues, { positive: true });
        validateDecimal(input.configuracion.horas_contratadas_operario_promedio, "/configuracion/horas_contratadas_operario_promedio", issues, { positive: true });
        if (isValidDecimal(input.configuracion.cantidad_operarios) && !D(input.configuracion.cantidad_operarios).isInteger()) {
            issues.push(issue("VAL-DAT-002", "La cantidad de operarios debe ser un número entero.", "/configuracion/cantidad_operarios"));
        }
    }
    if (input.capacidad_normal_horas !== undefined) {
        validateDecimal(input.capacidad_normal_horas, "/capacidad_normal_horas", issues, { positive: true });
    }
    if (input.horas_mod_disponibles !== undefined) {
        validateDecimal(input.horas_mod_disponibles, "/horas_mod_disponibles", issues, { positive: true });
    }
    const itemsById = new Map(input.items.map((item) => [item.item_id, item]));
    if (itemsById.size !== input.items.length) {
        issues.push(issue("VAL-DAT-005", "Los identificadores de ítem deben ser únicos.", "/items"));
    }
    const codes = new Set(input.items.map((item) => item.codigo.trim().toLocaleLowerCase("es")));
    if (codes.size !== input.items.length) {
        issues.push(issue("VAL-DAT-005", "Los códigos de ítem deben ser únicos.", "/items"));
    }
    if (input.items.filter((item) => item.vendible && item.activo !== false).length > 5) {
        issues.push(issue("VAL-LIM-001", "El tier gratuito admite como máximo cinco SKU vendibles.", "/items"));
    }
    if (input.items.filter((item) => item.tipo_item === "producto_intermedio" && item.activo !== false).length > 10) {
        issues.push(issue("VAL-LIM-002", "El tier gratuito admite como máximo diez productos intermedios.", "/items"));
    }
    input.items.forEach((item, index) => validateItem(item, index, itemsById, issues));
    validateGraph(itemsById, issues);
    const canCalculateOccupiedHours = input.items.every((item) => {
        if (!item.vendible || item.activo === false || item.origen_item === "comprado")
            return true;
        return isValidDecimal(item.venta?.cantidad_base)
            && (item.mano_obra ?? []).every((labor) => isValidDecimal(labor.horas_estandar))
            && (item.participacion_comprada === undefined || isValidDecimal(item.participacion_comprada));
    });
    if (canCalculateOccupiedHours) {
        const occupiedHours = input.items.reduce((total, item) => {
            if (!item.vendible || item.activo === false || item.origen_item === "comprado")
                return total;
            const manufacturedShare = item.origen_item === "mixto"
                ? D(1).minus(D(item.participacion_comprada ?? "0.5"))
                : D(1);
            const standardHours = (item.mano_obra ?? []).reduce((hours, labor) => hours.plus(D(labor.horas_estandar)), D(0));
            return total.plus(D(item.venta?.cantidad_base ?? 0).times(manufacturedShare).times(standardHours));
        }, D(0));
        const configuredAvailableHours = isValidDecimal(input.configuracion.cantidad_operarios)
            && isValidDecimal(input.configuracion.horas_contratadas_operario_promedio)
            ? D(input.configuracion.cantidad_operarios).times(D(input.configuracion.horas_contratadas_operario_promedio))
            : isValidDecimal(input.horas_mod_disponibles)
                ? D(input.horas_mod_disponibles)
                : undefined;
        if (isValidDecimal(input.configuracion.total_salarios_operarios_periodo) && occupiedHours.lte(0)) {
            issues.push(issue("VAL-MOD-002", "No hay horas ocupadas para distribuir el total de salarios de operarios.", "/items", { horas_ocupadas: occupiedHours.toString() }, {
                fase: "pre_calculo",
                alcance: "cálculo de MOD y resultados",
                remediacion: "Informá unidades fabricadas y una producción por hora hombre mayor que cero.",
                formula_ids: ["MOD-001"]
            }));
        }
        if (configuredAvailableHours !== undefined && occupiedHours.gt(configuredAvailableHours)) {
            issues.push(issue("VAL-MOD-001", "Las horas ocupadas totales superan las horas disponibles del período.", "/configuracion/cantidad_operarios", {
                horas_ocupadas: occupiedHours.toString(),
                horas_disponibles: configuredAvailableHours.toString(),
                exceso_horas: occupiedHours.minus(configuredAvailableHours).toString()
            }, {
                fase: "pre_calculo",
                alcance: "cálculo completo",
                remediacion: "Revisá las unidades fabricadas, la producción por hora hombre o la capacidad contratada de los operarios.",
                formula_ids: ["MOD-001", "MOD-002"]
            }));
        }
    }
    const costIds = new Set();
    input.costos.forEach((cost, index) => {
        const path = `/costos/${index}`;
        if (costIds.has(cost.costo_id))
            issues.push(issue("VAL-DAT-005", "Los identificadores de costo deben ser únicos.", `${path}/costo_id`));
        costIds.add(cost.costo_id);
        validateDecimal(cost.monto_neto_total, `${path}/monto_neto_total`, issues);
        if (cost.trazabilidad === "directo") {
            if (!cost.item_directo_id || !itemsById.has(cost.item_directo_id)) {
                issues.push(issue("VAL-DAT-004", "Un costo directo requiere un ítem existente.", `${path}/item_directo_id`));
            }
        }
        else if (!cost.driver) {
            issues.push(issue("VAL-DAT-001", "Un costo indirecto requiere un driver.", `${path}/driver`));
        }
    });
    if (input.tolerancia_conciliacion !== undefined) {
        validateDecimal(input.tolerancia_conciliacion, "/tolerancia_conciliacion", issues);
    }
    return issues;
}
//# sourceMappingURL=validation.js.map