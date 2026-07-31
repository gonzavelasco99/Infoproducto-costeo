import { D } from "./decimal.js";
const issue = (codigo, mensaje, source_path, detalle) => ({
    codigo,
    severidad: "error_bloqueante",
    mensaje,
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
        validateDecimal(compra.precio_bruto_unitario, `${compraPath}/precio_bruto_unitario`, issues);
        validateDecimal(compra.alicuota_iva, `${compraPath}/alicuota_iva`, issues);
        if (compra.costo_adquisicion_directo_total !== undefined) {
            validateDecimal(compra.costo_adquisicion_directo_total, `${compraPath}/costo_adquisicion_directo_total`, issues);
        }
    });
    if (item.receta) {
        validateDecimal(item.receta.cantidad_salida_base, `${base}/receta/cantidad_salida_base`, issues, { positive: true });
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
        validateDecimal(item.venta.precio_bruto_unitario, `${base}/venta/precio_bruto_unitario`, issues);
        validateDecimal(item.venta.alicuota_iva, `${base}/venta/alicuota_iva`, issues);
        if (item.venta.descuento_bruto_total !== undefined) {
            validateDecimal(item.venta.descuento_bruto_total, `${base}/venta/descuento_bruto_total`, issues);
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
    const costIds = new Set();
    input.costos.forEach((cost, index) => {
        const path = `/costos/${index}`;
        if (costIds.has(cost.costo_id))
            issues.push(issue("VAL-DAT-005", "Los identificadores de costo deben ser únicos.", `${path}/costo_id`));
        costIds.add(cost.costo_id);
        validateDecimal(cost.monto_total, `${path}/monto_total`, issues);
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