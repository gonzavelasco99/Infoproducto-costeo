"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BusinessConfigurationInput,
  CalculationInput,
  CalculationOutcome,
  DriverKind,
  ItemInput,
  OrigenItem,
  ValidationIssue
} from "@costeo/domain";
import { createNativeFile, readNativeFile } from "../app/native-file";

const UNIT_ID = "00000000-0000-4000-8000-000000000001";

type WizardStep = "diagnostico" | "productos" | "costos" | "resultados";

interface ConfigurationForm {
  tipoActividad: BusinessConfigurationInput["tipo_actividad"];
  condicionFiscal: BusinessConfigurationInput["condicion_fiscal"];
  alicuotaImpuestoResultado: string;
  salarioModPeriodo: string;
  cantidadOperarios: string;
  horasContratadasOperarioPromedio: string;
  driverIndirectos: Exclude<DriverKind, "manual">;
  aceptaTerminos: boolean;
}

interface MaterialForm {
  key: number;
  material: string;
  unidadConsumo: string;
  costoUnitarioNeto: string;
  mermaPorcentaje: string;
  consumoProducto: string;
}

interface ProductForm {
  key: number;
  codigo: string;
  nombre: string;
  origen: Extract<OrigenItem, "comprado" | "fabricado" | "mixto">;
  cantidadPeriodo: string;
  precioVentaNeto: string;
  costoCompraNeto: string;
  materiales: MaterialForm[];
  produccionPorHoraHombre: string;
  participacionComprada: string;
}

interface PeriodCostForm {
  key: number;
  nombre: string;
  categoria: "produccion" | "administracion" | "comercializacion" | "logistica" | "generales" | "impuestos_tasas" | "financieros" | "amortizaciones_depreciaciones";
  montoNeto: string;
}

const initialConfiguration: ConfigurationForm = {
  tipoActividad: "fabricacion",
  condicionFiscal: "responsable_inscripto",
  alicuotaImpuestoResultado: "",
  salarioModPeriodo: "240000",
  cantidadOperarios: "2",
  horasContratadasOperarioPromedio: "160",
  driverIndirectos: "horas_mod",
  aceptaTerminos: false
};

function makeMaterial(key: number): MaterialForm {
  return {
    key,
    material: key === 1 ? "Material principal" : `Material ${key}`,
    unidadConsumo: "unidad",
    costoUnitarioNeto: "1000",
    mermaPorcentaje: "5",
    consumoProducto: "1"
  };
}

function makeProduct(key: number, activity: ConfigurationForm["tipoActividad"]): ProductForm {
  const origin = activity === "reventa" ? "comprado" : activity === "mixto" ? "mixto" : "fabricado";
  return {
    key,
    codigo: `SKU-${String(key).padStart(3, "0")}`,
    nombre: key === 1 ? "Producto principal" : `Producto ${key}`,
    origen: origin,
    cantidadPeriodo: "100",
    precioVentaNeto: "2000",
    costoCompraNeto: "1200",
    materiales: [makeMaterial(1)],
    produccionPorHoraHombre: "2",
    participacionComprada: "0.25"
  };
}

const initialCosts: PeriodCostForm[] = [
  {
    key: 1,
    nombre: "Estructura productiva",
    categoria: "produccion",
    montoNeto: "20000"
  },
  {
    key: 2,
    nombre: "Administración general",
    categoria: "administracion",
    montoNeto: "15000"
  }
];

const stepLabels: Record<WizardStep, string> = {
  diagnostico: "Diagnóstico",
  productos: "Productos",
  costos: "Costos y ventas",
  resultados: "Resultados"
};

const layerLabels: Record<string, string> = {
  costo_directo: "Costo directo",
  costo_productivo_normal: "Costo productivo normal",
  margen_bruto: "Margen bruto",
  contribucion_marginal: "Contribución marginal",
  resultado_operativo: "Resultado operativo",
  resultado_neto_estimado: "Resultado neto estimado"
};

const driverLabels: Record<DriverKind, string> = {
  manual: "Base manual",
  costo_directo: "Costo directo",
  ventas_netas: "Ventas netas",
  unidades_vendidas: "Unidades del período",
  horas_mod: "Horas de mano de obra",
  uniforme: "Distribución uniforme"
};

function idFor(slot: number): string {
  return `00000000-0000-4000-8000-${String(slot).padStart(12, "0")}`;
}

function money(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2
  }).format(Number(value));
}

function normalizedDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(12).replace(/\.?0+$/, "");
}

function inverseDecimal(value: string): string {
  const number = Number(value);
  return number > 0 ? normalizedDecimal(1 / number) : "0";
}

function percentToFraction(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? normalizedDecimal(number / 100) : "0";
}

function fractionToPercent(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? normalizedDecimal(number * 100) : "0";
}

function percentageOfSales(value: string, sales: string): string {
  const salesNumber = Number(sales);
  if (!Number.isFinite(salesNumber) || salesNumber === 0) return "—";
  return new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) / salesNumber);
}

function ValidationCenter({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <section className="validation-center" aria-label="Centro de validaciones">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Centro de validaciones</p>
          <h3>Qué revisar antes de usar el resultado</h3>
        </div>
        <span className="count-badge">{issues.length}</span>
      </div>
      <div className="validation-list">
        {issues.map((entry, index) => (
          <article className={`validation-item ${entry.severidad}`} key={`${entry.codigo}-${entry.source_path ?? index}`}>
            <div className="validation-meta">
              <strong>{entry.codigo}</strong>
              <span>{entry.fase.replace("_", " ")}</span>
              <span>{entry.severidad.replaceAll("_", " ")}</span>
            </div>
            <p>{entry.mensaje}</p>
            <small><b>Cómo resolverlo:</b> {entry.remediacion}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function originForActivity(activity: ConfigurationForm["tipoActividad"], current: ProductForm["origen"]): ProductForm["origen"] {
  if (activity === "fabricacion") return "fabricado";
  if (activity === "reventa") return "comprado";
  return current;
}

export function CostingWizard() {
  const [step, setStep] = useState<WizardStep>("diagnostico");
  const [diagnosticCompleted, setDiagnosticCompleted] = useState(false);
  const [configuration, setConfiguration] = useState<ConfigurationForm>(initialConfiguration);
  const [products, setProducts] = useState<ProductForm[]>(() => [makeProduct(1, initialConfiguration.tipoActividad)]);
  const [costs, setCosts] = useState<PeriodCostForm[]>(initialCosts);
  const [result, setResult] = useState<CalculationOutcome | null>(null);
  const [working, setWorking] = useState(false);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const nextProductKey = useRef(2);
  const nextCostKey = useRef(3);

  useEffect(() => {
    const worker = new Worker(new URL("../app/calculation.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<CalculationOutcome>) => {
      setResult(event.data);
      setWorking(false);
      setStep("resultados");
    };
    worker.onerror = () => {
      setWorking(false);
      setFileMessage("No se pudo ejecutar el cálculo local. Revisá los datos e intentá nuevamente.");
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const totalOccupiedHours = useMemo(() => products.reduce((total, product) => {
    if (product.origen === "comprado") return total;
    const outputPerHour = Number(product.produccionPorHoraHombre);
    const periodQuantity = Number(product.cantidadPeriodo);
    const manufacturedShare = product.origen === "mixto" ? 1 - Number(product.participacionComprada) : 1;
    if (outputPerHour <= 0 || periodQuantity < 0 || manufacturedShare < 0) return total;
    return total + (periodQuantity * manufacturedShare) / outputPerHour;
  }, 0), [products]);

  const availableLaborHours = Number(configuration.cantidadOperarios) * Number(configuration.horasContratadasOperarioPromedio);
  const laborCostPerHour = totalOccupiedHours > 0
    ? Number(configuration.salarioModPeriodo) / totalOccupiedHours
    : 0;
  const capacityExceeded = Number.isFinite(availableLaborHours)
    && availableLaborHours >= 0
    && totalOccupiedHours > availableLaborHours;

  const input = useMemo<CalculationInput>(() => {
    const items: ItemInput[] = [];
    for (const product of products) {
      const productId = idFor(1000 + product.key);
      const purchaseId = idFor(3000 + product.key);
      const laborId = idFor(4000 + product.key);
      const isManufactured = product.origen === "fabricado" || product.origen === "mixto";
      const isPurchased = product.origen === "comprado" || product.origen === "mixto";
      const components = isManufactured ? product.materiales.map((material) => {
        const rawSlot = 200000 + product.key * 100 + material.key;
        const rawId = idFor(rawSlot);
        items.push({
          item_id: rawId,
          codigo: `MP-${String(product.key).padStart(2, "0")}-${String(material.key).padStart(2, "0")}`,
          nombre: material.material || `Material ${material.key}`,
          tipo_item: "materia_prima",
          origen_item: "comprado",
          vendible: false,
          inventariable: true,
          unidad_base_id: UNIT_ID,
          unidad_descripcion: material.unidadConsumo || "unidad",
          compras: [{
            compra_id: idFor(500000 + product.key * 100 + material.key),
            cantidad_base: "1",
            precio_neto_unitario: material.costoUnitarioNeto
          }]
        });
        return {
          item_componente_id: rawId,
          cantidad_neta: material.consumoProducto,
          merma_estandar: percentToFraction(material.mermaPorcentaje)
        };
      }) : [];

      items.push({
        item_id: productId,
        codigo: product.codigo,
        nombre: product.nombre,
        tipo_item: product.origen === "comprado" ? "mercaderia_reventa" : "producto_final",
        origen_item: product.origen,
        vendible: true,
        inventariable: true,
        unidad_base_id: UNIT_ID,
        ...(isPurchased ? {
          compras: [{
            compra_id: purchaseId,
            cantidad_base: "1",
            precio_neto_unitario: product.costoCompraNeto
          }]
        } : {}),
        ...(isManufactured ? {
          receta: {
            cantidad_salida_base: "1",
            componentes: components
          },
          mano_obra: [{
            rol_id: laborId,
            horas_estandar: inverseDecimal(product.produccionPorHoraHombre),
            costo_hora_completo: normalizedDecimal(laborCostPerHour),
            comportamiento: "variable" as const
          }]
        } : {}),
        ...(product.origen === "mixto" ? { participacion_comprada: product.participacionComprada } : {}),
        venta: {
          cantidad_base: product.cantidadPeriodo,
          precio_neto_unitario: product.precioVentaNeto
        }
      });
    }

    return {
      schema_version: "2026-07-31.beta2",
      calculation_id: crypto.randomUUID(),
      configuracion: {
        tipo_actividad: configuration.tipoActividad,
        objetivo: "ambos",
        madurez_datos: "inicial",
        condicion_fiscal: configuration.condicionFiscal,
        canal_default: "venta_general",
        importes_sin_iva: true,
        ...(configuration.tipoActividad === "reventa" ? {} : {
          total_salarios_operarios_periodo: configuration.salarioModPeriodo,
          cantidad_operarios: configuration.cantidadOperarios,
          horas_contratadas_operario_promedio: configuration.horasContratadasOperarioPromedio
        }),
        ...(configuration.condicionFiscal !== "responsable_inscripto" || configuration.alicuotaImpuestoResultado.trim() === ""
          ? {}
          : { alicuota_impuesto_resultado: configuration.alicuotaImpuestoResultado })
      },
      moneda_base: "ARS",
      ...(configuration.tipoActividad === "reventa"
        ? {}
        : { horas_mod_disponibles: normalizedDecimal(availableLaborHours) }),
      items,
      costos: costs.map((cost) => ({
        costo_id: idFor(6000 + cost.key),
        nombre: cost.nombre,
        categoria: cost.categoria,
        monto_neto_total: cost.montoNeto,
        trazabilidad: "indirecto" as const,
        comportamiento: "fijo" as const,
        driver: { tipo: configuration.driverIndirectos }
      }))
    };
  }, [configuration, costs, laborCostPerHour, products]);

  const changeActivity = (activity: ConfigurationForm["tipoActividad"]) => {
    setConfiguration((current) => ({
      ...current,
      tipoActividad: activity,
      driverIndirectos: activity === "reventa" && current.driverIndirectos === "horas_mod"
        ? "ventas_netas"
        : current.driverIndirectos
    }));
    setProducts((current) => current.map((product) => ({
      ...product,
      origen: originForActivity(activity, product.origen)
    })));
    if (activity === "reventa") {
      setCosts((current) => current.filter((cost) => cost.categoria !== "produccion"));
    } else if (!costs.some((cost) => cost.categoria === "produccion")) {
      setCosts((current) => [initialCosts[0] as PeriodCostForm, ...current]);
    }
    setDiagnosticCompleted(false);
    setResult(null);
  };

  const updateConfiguration = <K extends keyof ConfigurationForm>(field: K, value: ConfigurationForm[K]) => {
    setConfiguration((current) => ({ ...current, [field]: value }));
    setDiagnosticCompleted(false);
    setResult(null);
  };

  const changeFiscalCondition = (condition: ConfigurationForm["condicionFiscal"]) => {
    setConfiguration((current) => ({
      ...current,
      condicionFiscal: condition,
      alicuotaImpuestoResultado: condition === "responsable_inscripto" ? current.alicuotaImpuestoResultado : ""
    }));
    setDiagnosticCompleted(false);
    setResult(null);
  };

  const updateProduct = <K extends keyof ProductForm>(key: number, field: K, value: ProductForm[K]) => {
    setProducts((current) => current.map((product) => product.key === key ? { ...product, [field]: value } : product));
    setResult(null);
  };

  const updateMaterial = <K extends keyof MaterialForm>(productKey: number, materialKey: number, field: K, value: MaterialForm[K]) => {
    setProducts((current) => current.map((product) => product.key !== productKey ? product : {
      ...product,
      materiales: product.materiales.map((material) => material.key === materialKey ? { ...material, [field]: value } : material)
    }));
    setResult(null);
  };

  const addMaterial = (productKey: number) => {
    setProducts((current) => current.map((product) => {
      if (product.key !== productKey || product.materiales.length >= 20) return product;
      const nextKey = Math.max(0, ...product.materiales.map((material) => material.key)) + 1;
      return { ...product, materiales: [...product.materiales, makeMaterial(nextKey)] };
    }));
    setResult(null);
  };

  const removeMaterial = (productKey: number, materialKey: number) => {
    setProducts((current) => current.map((product) => product.key !== productKey || product.materiales.length === 1 ? product : {
      ...product,
      materiales: product.materiales.filter((material) => material.key !== materialKey)
    }));
    setResult(null);
  };

  const addProduct = () => {
    if (products.length >= 5) return;
    const key = nextProductKey.current++;
    setProducts((current) => [...current, makeProduct(key, configuration.tipoActividad)]);
  };

  const removeProduct = (key: number) => {
    if (products.length === 1) return;
    setProducts((current) => current.filter((product) => product.key !== key));
    setResult(null);
  };

  const updateCost = <K extends keyof PeriodCostForm>(key: number, field: K, value: PeriodCostForm[K]) => {
    setCosts((current) => current.map((cost) => cost.key === key ? { ...cost, [field]: value } : cost));
    setResult(null);
  };

  const addCost = () => {
    const key = nextCostKey.current++;
    setCosts((current) => [...current, {
      key,
      nombre: "Nuevo costo del período",
      categoria: "generales",
      montoNeto: "0"
    }]);
  };

  const removeCost = (key: number) => {
    setCosts((current) => current.filter((entry) => entry.key !== key));
    setResult(null);
  };

  const calculateNow = () => {
    setWorking(true);
    setResult(null);
    setFileMessage(null);
    workerRef.current?.postMessage(input);
  };

  const downloadNativeFile = async () => {
    const blob = await createNativeFile(input);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "costeo-gratis.costeo.zip";
    anchor.click();
    URL.revokeObjectURL(url);
    setFileMessage("Archivo local exportado con configuración, contrato e integridad verificable.");
  };

  const hydrateFromInput = (imported: CalculationInput) => {
    const byId = new Map(imported.items.map((item) => [item.item_id, item]));
    const importedProducts = imported.items.filter((item) => item.vendible).slice(0, 5).map((item, index): ProductForm => {
      return {
        key: index + 1,
        codigo: item.codigo,
        nombre: item.nombre,
        origen: item.origen_item === "mixto" ? "mixto" : item.origen_item === "fabricado" ? "fabricado" : "comprado",
        cantidadPeriodo: item.venta?.cantidad_base ?? "0",
        precioVentaNeto: item.venta?.precio_neto_unitario ?? "0",
        costoCompraNeto: item.compras?.[0]?.precio_neto_unitario ?? "0",
        materiales: (item.receta?.componentes ?? []).slice(0, 20).map((component, componentIndex) => {
          const raw = byId.get(component.item_componente_id);
          return {
            key: componentIndex + 1,
            material: raw?.nombre ?? `Material ${componentIndex + 1}`,
            unidadConsumo: raw?.unidad_descripcion ?? "unidad",
            costoUnitarioNeto: raw?.compras?.[0]?.precio_neto_unitario ?? "0",
            mermaPorcentaje: fractionToPercent(component.merma_estandar),
            consumoProducto: component.cantidad_neta
          };
        }).concat(item.receta?.componentes.length ? [] : [makeMaterial(1)]),
        produccionPorHoraHombre: inverseDecimal(item.mano_obra?.[0]?.horas_estandar ?? "0"),
        participacionComprada: item.participacion_comprada ?? "0.5"
      };
    });
    const productsToLoad = importedProducts.length > 0 ? importedProducts : [makeProduct(1, imported.configuracion.tipo_actividad)];
    const importedOccupiedHours = productsToLoad.reduce((total, product) => {
      if (product.origen === "comprado") return total;
      const share = product.origen === "mixto" ? 1 - Number(product.participacionComprada) : 1;
      const rate = Number(product.produccionPorHoraHombre);
      return rate > 0 ? total + Number(product.cantidadPeriodo) * share / rate : total;
    }, 0);
    const importedHourlyCost = imported.items.find((item) => (item.mano_obra?.length ?? 0) > 0)?.mano_obra?.[0]?.costo_hora_completo ?? "0";
    const importedAvailableHours = imported.horas_mod_disponibles
      ?? imported.capacidad_normal_horas
      ?? (importedOccupiedHours > 0 ? normalizedDecimal(importedOccupiedHours) : "160");
    const importedOperatorCount = imported.configuracion.cantidad_operarios ?? "1";
    const importedAverageContractedHours = imported.configuracion.horas_contratadas_operario_promedio
      ?? normalizedDecimal(Number(importedAvailableHours) / Number(importedOperatorCount));
    const requestedDriver = imported.costos.find((cost) => cost.trazabilidad === "indirecto")?.driver?.tipo;
    setConfiguration({
      tipoActividad: imported.configuracion.tipo_actividad,
      condicionFiscal: imported.configuracion.condicion_fiscal,
      alicuotaImpuestoResultado: imported.configuracion.condicion_fiscal === "responsable_inscripto"
        ? imported.configuracion.alicuota_impuesto_resultado ?? ""
        : "",
      salarioModPeriodo: imported.configuracion.total_salarios_operarios_periodo
        ?? normalizedDecimal(Number(importedHourlyCost) * importedOccupiedHours),
      cantidadOperarios: importedOperatorCount,
      horasContratadasOperarioPromedio: importedAverageContractedHours,
      driverIndirectos: requestedDriver === undefined || requestedDriver === "manual" ? "uniforme" : requestedDriver,
      aceptaTerminos: true
    });
    setProducts(productsToLoad);
    setCosts(imported.costos.map((cost, index) => ({
      key: index + 1,
      nombre: cost.nombre,
      categoria: (["produccion", "administracion", "comercializacion", "logistica", "generales", "impuestos_tasas", "financieros", "amortizaciones_depreciaciones"] as const).includes(cost.categoria as PeriodCostForm["categoria"])
        ? cost.categoria as PeriodCostForm["categoria"]
        : "generales",
      montoNeto: cost.monto_neto_total
    })));
    nextProductKey.current = importedProducts.length + 1;
    nextCostKey.current = imported.costos.length + 1;
    setDiagnosticCompleted(false);
    setStep("diagnostico");
    setResult(null);
  };

  const importNativeFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await readNativeFile(file);
      hydrateFromInput(imported);
      setFileMessage("Archivo validado e importado. Confirmá el diagnóstico para continuar con esta sesión temporal.");
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      event.target.value = "";
    }
  };

  const blockingCount = result?.validaciones.filter((entry) => entry.severidad === "error_bloqueante").length ?? 0;
  const warningCount = result?.validaciones.length === undefined ? 0 : result.validaciones.length - blockingCount;

  return (
    <section className="costing-app" aria-label="Asistente de costeo gratuito">
      <nav className="wizard-progress" aria-label="Progreso de la sesión">
        {(Object.keys(stepLabels) as WizardStep[]).map((item, index) => {
          const lockedByDiagnosis = !diagnosticCompleted && (item === "productos" || item === "costos");
          return (
            <button
              className={step === item ? "active" : ""}
              disabled={lockedByDiagnosis || (item === "resultados" && result === null)}
              key={item}
              onClick={() => setStep(item)}
              title={lockedByDiagnosis ? "Aceptá la sesión temporal y continuá desde Diagnóstico para habilitar esta pestaña." : undefined}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {stepLabels[item]}
            </button>
          );
        })}
      </nav>

      <div className="app-layout">
        <div className="flow-column">
          {step === "diagnostico" && (
            <section className="panel flow-panel">
              <div className="panel-title">
                <span>01</span>
                <div>
                  <p className="section-kicker">Configuración del negocio</p>
                  <h2>Primero, contanos cómo trabajás.</h2>
                  <p>Usaremos estas respuestas para mostrar sólo los campos y cálculos aplicables.</p>
                </div>
              </div>

              <fieldset>
                <legend>Actividad principal</legend>
                <div className="choice-grid three">
                  {([
                    ["fabricacion", "Fabricación", "Producís uno o más artículos propios."],
                    ["reventa", "Reventa", "Comprás mercadería terminada y la revendés."],
                    ["mixto", "Actividad mixta", "Combinás productos fabricados y comprados."]
                  ] as const).map(([value, title, description]) => (
                    <label className={`choice-card ${configuration.tipoActividad === value ? "selected" : ""}`} key={value}>
                      <input checked={configuration.tipoActividad === value} name="activity" onChange={() => changeActivity(value)} type="radio" />
                      <strong>{title}</strong>
                      <span>{description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="form-grid">
                <label>
                  Condición fiscal
                  <select value={configuration.condicionFiscal} onChange={(event) => changeFiscalCondition(event.target.value as ConfigurationForm["condicionFiscal"])}>
                    <option value="responsable_inscripto">Responsable inscripto</option>
                    <option value="monotributista">Monotributista</option>
                    <option value="exento">Exento</option>
                  </select>
                </label>
                <label>
                  Alícuota de Impuesto a las Ganancias <em>opcional</em>
                  <input
                    disabled={configuration.condicionFiscal !== "responsable_inscripto"}
                    inputMode="decimal"
                    placeholder={configuration.condicionFiscal === "responsable_inscripto" ? "Ej.: 0.30" : "No aplica para la condición seleccionada"}
                    value={configuration.alicuotaImpuestoResultado}
                    onChange={(event) => updateConfiguration("alicuotaImpuestoResultado", event.target.value)}
                  />
                  <small>{configuration.condicionFiscal === "responsable_inscripto" ? "Ingresala como fracción: 30% se carga 0.30." : "Se habilita únicamente para Responsable inscripto."}</small>
                </label>
                {configuration.tipoActividad !== "reventa" && (
                  <label>
                    Total de salarios de operarios para el período <em>estimado o aproximado</em>
                    <input inputMode="decimal" value={configuration.salarioModPeriodo} onChange={(event) => updateConfiguration("salarioModPeriodo", event.target.value)} />
                    <small>Sumá los salarios estimados de todos los operarios para el mismo período de análisis.</small>
                  </label>
                )}
                {configuration.tipoActividad !== "reventa" && (
                  <label>
                    Cantidad de operarios
                    <input inputMode="numeric" value={configuration.cantidadOperarios} onChange={(event) => updateConfiguration("cantidadOperarios", event.target.value)} />
                    <small>Número de operarios afectados a la producción durante el período.</small>
                  </label>
                )}
                {configuration.tipoActividad !== "reventa" && (
                  <label>
                    Horas contratadas de operario en el período <em>promedio</em>
                    <input inputMode="decimal" value={configuration.horasContratadasOperarioPromedio} onChange={(event) => updateConfiguration("horasContratadasOperarioPromedio", event.target.value)} />
                    <small>Promedio de horas contratadas por cada operario. La capacidad disponible es operarios × horas promedio.</small>
                  </label>
                )}
                <label>
                  Driver de asignación de costos indirectos
                  <select value={configuration.driverIndirectos} onChange={(event) => updateConfiguration("driverIndirectos", event.target.value as ConfigurationForm["driverIndirectos"])}>
                    {Object.entries(driverLabels)
                      .filter(([key]) => key !== "manual" && !(configuration.tipoActividad === "reventa" && key === "horas_mod"))
                      .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <small>El mismo criterio se aplicará a todos los costos y gastos indirectos de esta sesión.</small>
                </label>
              </div>

              <aside className="net-policy">
                <strong>Política de importes</strong>
                <p>El objetivo de la sesión es conocer <b>costos y rentabilidad</b>. Todos los costos, gastos y precios se cargan <b>sin IVA</b>.</p>
              </aside>

              <label className="consent-check">
                <input checked={configuration.aceptaTerminos} onChange={(event) => {
                  setConfiguration((current) => ({ ...current, aceptaTerminos: event.target.checked }));
                  if (!event.target.checked) setDiagnosticCompleted(false);
                }} type="checkbox" />
                <span>Acepto iniciar una sesión temporal sin persistencia en servidor.</span>
              </label>

              <div className="flow-actions">
                <label className="file-input compact">Abrir archivo anterior<input type="file" accept=".zip,.costeo" onChange={importNativeFile} /></label>
                <button disabled={!configuration.aceptaTerminos} onClick={() => {
                  setDiagnosticCompleted(true);
                  setStep("productos");
                }} type="button">Continuar con productos</button>
              </div>
            </section>
          )}

          {step === "productos" && (
            <section className="panel flow-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Maestro simplificado</p>
                  <h2>Productos a costear</h2>
                  <p>Podés cargar hasta cinco SKU vendibles en el tier gratuito.</p>
                </div>
                <span className="limit-badge">{products.length}/5 SKU</span>
              </div>

              <div className="product-list">
                {products.map((product, index) => {
                  const showManufacturing = product.origen !== "comprado";
                  const showPurchase = product.origen !== "fabricado";
                  const productionPerLaborHour = Number(product.produccionPorHoraHombre);
                  const laborUnitCost = productionPerLaborHour > 0 ? laborCostPerHour / productionPerLaborHour : 0;
                  return (
                    <article className="editor-card" key={product.key}>
                      <div className="editor-card-header">
                        <div><span>SKU {index + 1}</span><h3>{product.nombre || "Producto sin nombre"}</h3></div>
                        {products.length > 1 && <button className="text-button danger" onClick={() => removeProduct(product.key)} type="button">Quitar</button>}
                      </div>
                      <div className="form-grid">
                        <label>Código<input value={product.codigo} onChange={(event) => updateProduct(product.key, "codigo", event.target.value)} /></label>
                        <label>Nombre<input value={product.nombre} onChange={(event) => updateProduct(product.key, "nombre", event.target.value)} /></label>
                        {configuration.tipoActividad === "mixto" && (
                          <label>
                            Origen del SKU
                            <select value={product.origen} onChange={(event) => updateProduct(product.key, "origen", event.target.value as ProductForm["origen"])}>
                              <option value="fabricado">Fabricado</option>
                              <option value="comprado">Reventa</option>
                              <option value="mixto">Comprado y fabricado</option>
                            </select>
                          </label>
                        )}
                        <label>{showManufacturing ? "Unidades fabricadas" : "Unidades vendidas"}<input inputMode="decimal" value={product.cantidadPeriodo} onChange={(event) => updateProduct(product.key, "cantidadPeriodo", event.target.value)} /></label>
                        <label>Precio de venta unitario <em>sin IVA</em><input inputMode="decimal" value={product.precioVentaNeto} onChange={(event) => updateProduct(product.key, "precioVentaNeto", event.target.value)} /></label>
                        {showPurchase && <label>Costo de compra unitario <em>sin IVA</em><input inputMode="decimal" value={product.costoCompraNeto} onChange={(event) => updateProduct(product.key, "costoCompraNeto", event.target.value)} /></label>}
                        {product.origen === "mixto" && <label>Participación comprada <em>fracción</em><input inputMode="decimal" value={product.participacionComprada} onChange={(event) => updateProduct(product.key, "participacionComprada", event.target.value)} /></label>}
                      </div>
                      {showManufacturing && (
                        <div className="subsection">
                          <div><strong>Receta estándar</strong><span>{product.materiales.length}/20 materiales</span></div>
                          <div className="recipe-table-wrapper">
                            <table className="recipe-table">
                              <thead>
                                <tr>
                                  <th>Material</th>
                                  <th>Unidad de consumo</th>
                                  <th>Costo unitario <small>sin IVA</small></th>
                                  <th>Merma estándar <small>%</small></th>
                                  <th>Consumo del producto</th>
                                  <th><span className="sr-only">Acciones</span></th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.materiales.map((material) => (
                                  <tr key={material.key}>
                                    <td><input aria-label={`Material ${material.key}`} value={material.material} onChange={(event) => updateMaterial(product.key, material.key, "material", event.target.value)} /></td>
                                    <td><input aria-label={`Unidad de consumo ${material.key}`} value={material.unidadConsumo} onChange={(event) => updateMaterial(product.key, material.key, "unidadConsumo", event.target.value)} /></td>
                                    <td><input aria-label={`Costo unitario del material ${material.key}`} inputMode="decimal" value={material.costoUnitarioNeto} onChange={(event) => updateMaterial(product.key, material.key, "costoUnitarioNeto", event.target.value)} /></td>
                                    <td><input aria-label={`Merma estándar ${material.key}`} inputMode="decimal" value={material.mermaPorcentaje} onChange={(event) => updateMaterial(product.key, material.key, "mermaPorcentaje", event.target.value)} /></td>
                                    <td><input aria-label={`Consumo del producto ${material.key}`} inputMode="decimal" value={material.consumoProducto} onChange={(event) => updateMaterial(product.key, material.key, "consumoProducto", event.target.value)} /></td>
                                    <td>{product.materiales.length > 1 && <button aria-label={`Quitar material ${material.key}`} className="text-button danger" onClick={() => removeMaterial(product.key, material.key)} type="button">Quitar</button>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button className="secondary add-material-button" disabled={product.materiales.length >= 20} onClick={() => addMaterial(product.key)} type="button">+ Agregar material</button>

                          <div className="labor-section">
                            <div>
                              <strong>Mano de obra directa (MOD)</strong>
                              <span>La MOD se distribuye según las horas productivas de cada SKU sobre el total. Así, el conjunto de productos absorbe el total de salarios del período.</span>
                            </div>
                            <div className="form-grid">
                              <label>Producción por hora hombre<input inputMode="decimal" value={product.produccionPorHoraHombre} onChange={(event) => updateProduct(product.key, "produccionPorHoraHombre", event.target.value)} /></label>
                              <label>Costo unitario de MOD <em>calculado</em><input disabled value={money(normalizedDecimal(laborUnitCost))} /></label>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              <button className="secondary add-button" disabled={products.length >= 5} onClick={addProduct} type="button">+ Agregar otro SKU</button>
              {capacityExceeded && (
                <aside className="capacity-alert" role="alert">
                  <strong>Capacidad de MOD excedida</strong>
                  <p>La producción requiere {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(totalOccupiedHours)} horas, pero informaste {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(availableLaborHours)} horas disponibles. Revisá las unidades fabricadas, la producción por hora hombre o la capacidad contratada antes de continuar.</p>
                </aside>
              )}
              <div className="flow-actions">
                <button className="secondary" onClick={() => setStep("diagnostico")} type="button">Volver</button>
                <button disabled={capacityExceeded} onClick={() => setStep("costos")} type="button">Continuar con costos</button>
              </div>
            </section>
          )}

          {step === "costos" && (
            <section className="panel flow-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Costos por categoría</p>
                  <h2>Costos y gastos del período</h2>
                  <p>Cargalos sin IVA. En este MVP todos se consideran fijos y se asignan con el driver elegido en el diagnóstico.</p>
                </div>
              </div>

              <aside className="driver-summary">
                <span>Driver único de la sesión</span>
                <strong>{driverLabels[configuration.driverIndirectos]}</strong>
                <small>Se aplicará a todos los costos y gastos indirectos.</small>
              </aside>

              <div className="cost-list">
                {costs.map((cost) => (
                    <article className="editor-card cost-card" key={cost.key}>
                      <div className="editor-card-header">
                        <div><span>Categoría</span><h3>{cost.nombre || "Costo sin nombre"}</h3></div>
                        <button className="text-button danger" onClick={() => removeCost(cost.key)} type="button">Quitar</button>
                      </div>
                      <div className="form-grid three-columns">
                        <label>Nombre<input value={cost.nombre} onChange={(event) => updateCost(cost.key, "nombre", event.target.value)} /></label>
                        <label>
                          Categoría
                          <select value={cost.categoria} onChange={(event) => updateCost(cost.key, "categoria", event.target.value as PeriodCostForm["categoria"])}>
                            <option value="produccion">Producción</option>
                            <option value="administracion">Administración</option>
                            <option value="comercializacion">Comercialización</option>
                            <option value="logistica">Logística</option>
                            <option value="generales">Generales</option>
                            <option value="impuestos_tasas">Impuestos/tasas</option>
                            <option value="financieros">Financieros</option>
                            <option value="amortizaciones_depreciaciones">Amortizaciones/depreciaciones</option>
                          </select>
                        </label>
                        <label>Monto total <em>sin IVA</em><input inputMode="decimal" value={cost.montoNeto} onChange={(event) => updateCost(cost.key, "montoNeto", event.target.value)} /></label>
                      </div>
                    </article>
                ))}
              </div>

              <button className="secondary add-button" onClick={addCost} type="button">+ Agregar costo o gasto</button>
              <div className="flow-actions">
                <button className="secondary" onClick={() => setStep("productos")} type="button">Volver</button>
                <button disabled={working} onClick={calculateNow} type="button">{working ? "Validando y calculando…" : "Validar y calcular"}</button>
              </div>
            </section>
          )}

          {step === "resultados" && (
            <section className="results-flow">
              {result === null && <div className="panel empty">Completá los datos y ejecutá el cálculo.</div>}
              {result !== null && !result.ok && (
                <section className="panel result-status blocked">
                  <p className="section-kicker">Resultado bloqueado</p>
                  <h2>Hay {blockingCount} dato{blockingCount === 1 ? "" : "s"} por corregir</h2>
                  <p>No presentamos cifras incompletas como si fueran definitivas. Corregí los hallazgos y volvé a calcular.</p>
                  <button onClick={() => setStep("costos")} type="button">Volver a los datos</button>
                </section>
              )}
              {result?.ok && (
                <>
                  <section className="panel result-status ready">
                    <div>
                      <p className="section-kicker">Resultado conciliado</p>
                      <h2>{products.length} SKU · {money(result.estado_resultados.margen_neto)}</h2>
                      <p>Margen neto estimado. {warningCount > 0 ? `${warningCount} observación metodológica.` : "Sin observaciones pendientes."}</p>
                    </div>
                    <div className="result-actions">
                      <button className="secondary" onClick={() => setStep("costos")} type="button">Editar datos</button>
                      <button onClick={downloadNativeFile} type="button">Guardar archivo local</button>
                    </div>
                  </section>

                  <section className="panel income-statement-panel">
                    <div className="section-heading compact-heading">
                      <div>
                        <p className="section-kicker">Estado de resultados prototípico</p>
                        <h3>Rentabilidad del negocio</h3>
                        <p>Importes del período sin IVA y participación sobre los ingresos por ventas.</p>
                      </div>
                    </div>
                    <div className="income-table-wrapper">
                      <table className="income-table">
                        <thead><tr><th>Concepto</th><th>Importe</th><th>% sobre ventas</th></tr></thead>
                        <tbody>
                          {([
                            ["Ingresos por ventas", result.estado_resultados.ingresos_ventas, "total"],
                            ["Costos directos", result.estado_resultados.costos_directos, "expense"],
                            ["Margen bruto", result.estado_resultados.margen_bruto, "subtotal"],
                            ["Gastos operativos", result.estado_resultados.gastos_operativos, "expense"],
                            ["Gastos administrativos", result.estado_resultados.gastos_administrativos, "expense"],
                            ["Gastos comerciales", result.estado_resultados.gastos_comerciales, "expense"],
                            ["Gastos logísticos", result.estado_resultados.gastos_logisticos, "expense"],
                            ["Margen operativo", result.estado_resultados.margen_operativo, "subtotal"],
                            ["Impuestos", result.estado_resultados.impuestos, "expense"],
                            ["Gastos financieros", result.estado_resultados.gastos_financieros, "expense"],
                            ["Amortizaciones", result.estado_resultados.amortizaciones, "expense"],
                            ["Margen neto", result.estado_resultados.margen_neto, "total"]
                          ] as const).map(([label, amount, kind]) => (
                            <tr className={kind} key={label}>
                              <th scope="row">{label}{label === "Impuestos" && Number(result.estado_resultados.impuesto_ganancias_estimado) > 0 ? <small>Incluye {money(result.estado_resultados.impuesto_ganancias_estimado)} de Ganancias estimado</small> : null}</th>
                              <td className={Number(amount) < 0 ? "negative" : ""}>{money(amount)}</td>
                              <td>{percentageOfSales(amount, result.estado_resultados.ingresos_ventas)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {result.eficiencia_mod && (
                    <section className={`panel labor-efficiency ${Number(result.eficiencia_mod.cociente_ocupacion) > 1 ? "over-capacity" : "within-capacity"}`}>
                      <div className="section-heading compact-heading">
                        <div>
                          <p className="section-kicker">Eficiencia de mano de obra</p>
                          <h3>Ocupación de MOD</h3>
                          <p>Horas reales requeridas respecto de las horas hombre disponibles teóricas.</p>
                        </div>
                        <strong>{new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(Number(result.eficiencia_mod.cociente_ocupacion))}</strong>
                      </div>
                      <div className="efficiency-track" aria-label="Cociente de horas ocupadas sobre horas disponibles">
                        <span style={{ width: `${Math.min(Number(result.eficiencia_mod.cociente_ocupacion) * 100, 100)}%` }} />
                      </div>
                      <div className="efficiency-values">
                        <span><b>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(result.eficiencia_mod.horas_ocupadas))}</b> horas ocupadas</span>
                        <span><b>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(result.eficiencia_mod.horas_disponibles))}</b> horas disponibles</span>
                        <span><b>{money(configuration.salarioModPeriodo)}</b> salarios informados</span>
                        <span><b>{money(normalizedDecimal(result.resultados_item.reduce((total, item) => total + Number(item.costo_mod_unitario ?? 0) * Number(item.unidades_vendidas_netas), 0)))}</b> MOD absorbida</span>
                      </div>
                    </section>
                  )}

                  <section className="panel layers-panel">
                    <div className="section-heading compact-heading"><div><p className="section-kicker">Resultados por capas</p><h3>Qué pudo calcularse</h3></div></div>
                    <div className="layer-grid">
                      {result.capas_resultado.filter((layer) => layer.codigo !== "costo_productivo_normal").map((layer) => (
                        <article className={layer.estado} key={layer.codigo}>
                          <span>{layer.estado === "calculado" ? "Disponible" : "Pendiente"}</span>
                          <strong>{layerLabels[layer.codigo]}</strong>
                          {layer.motivo && <small>{layer.motivo}</small>}
                        </article>
                      ))}
                    </div>
                  </section>

                  <div className="sku-results">
                    {result.resultados_item.map((item) => {
                      const productName = products.find((product) => product.codigo === item.codigo)?.nombre ?? item.codigo;
                      return (
                        <section className="panel sku-result" key={item.item_id}>
                          <div className="section-heading compact-heading">
                            <div><p className="section-kicker">{item.codigo}</p><h3>{productName}</h3></div>
                            <strong className={Number(item.resultado_operativo_trazabilidad) >= 0 ? "positive" : "negative"}>{money(item.resultado_operativo_trazabilidad)}</strong>
                          </div>
                          <div className="kpis">
                            <article><span>Ventas netas</span><strong>{money(item.ventas_netas)}</strong></article>
                            <article><span>Costo directo</span><strong>{money(item.costo_directo)}</strong></article>
                            <article><span>Margen bruto</span><strong>{money(item.margen_bruto)}</strong></article>
                            <article className="accent"><span>Resultado operativo</span><strong>{money(item.resultado_operativo_trazabilidad)}</strong></article>
                          </div>
                          <dl className="breakdown">
                            <div><dt>Costo unitario de MOD</dt><dd>{money(item.costo_mod_unitario)}</dd></div>
                            <div><dt>Costo directo unitario</dt><dd>{money(item.costo_directo_unitario)}</dd></div>
                            <div><dt>Indirectos absorbidos unitarios</dt><dd>{money(item.costo_indirecto_unitario)}</dd></div>
                            <div><dt>Costo unitario total</dt><dd>{money(item.costo_completo_unitario_gerencial)}</dd></div>
                            <div><dt>Resultado neto estimado</dt><dd>{money(item.resultado_neto_estimado)}</dd></div>
                          </dl>
                        </section>
                      );
                    })}
                  </div>

                  <div className={result.conciliacion.conciliado ? "reconcile ok" : "reconcile bad"}>
                    <strong>{result.conciliacion.conciliado ? "Conciliación OK" : "Revisar conciliación"}</strong>
                    <span>Diferencia entre vistas: {money(result.conciliacion.diferencia_vistas)}</span>
                  </div>
                </>
              )}
              {result && <ValidationCenter issues={result.validaciones} />}
            </section>
          )}
        </div>

        <aside className="session-sidebar">
          <section className="panel summary-card">
            <p className="section-kicker">Sesión gratuita</p>
            <h3>{configuration.tipoActividad === "fabricacion" ? "Fabricación" : configuration.tipoActividad === "reventa" ? "Reventa" : "Actividad mixta"}</h3>
            <dl>
              <div><dt>Canal</dt><dd>Venta general</dd></div>
              <div><dt>Moneda</dt><dd>ARS</dd></div>
              <div><dt>Importes</dt><dd>Sin IVA</dd></div>
              <div><dt>Productos</dt><dd>{products.length}/5</dd></div>
              <div><dt>Costos</dt><dd>{costs.length}</dd></div>
              <div><dt>Driver</dt><dd>{driverLabels[configuration.driverIndirectos]}</dd></div>
              {configuration.tipoActividad !== "reventa" && <div><dt>Horas MOD ocupadas</dt><dd>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(totalOccupiedHours)}</dd></div>}
              {configuration.tipoActividad !== "reventa" && <div><dt>Operarios</dt><dd>{configuration.cantidadOperarios}</dd></div>}
              {configuration.tipoActividad !== "reventa" && <div><dt>Horas MOD disponibles</dt><dd>{new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(availableLaborHours)}</dd></div>}
            </dl>
          </section>
          <section className="panel guidance-card">
            <p className="section-kicker">Plan de carga</p>
            <ol>
              <li className={diagnosticCompleted ? "done" : ""}>Configurar negocio</li>
              <li className={step === "costos" || step === "resultados" ? "done" : ""}>Definir productos</li>
              <li className={step === "resultados" ? "done" : ""}>Cargar costos y ventas</li>
              <li className={result !== null ? "done" : ""}>Validar y calcular</li>
            </ol>
            <p>Los resultados son de gestión y no reemplazan información contable o fiscal formal.</p>
          </section>
          {fileMessage && <p className="file-message side-message">{fileMessage}</p>}
        </aside>
      </div>
    </section>
  );
}
