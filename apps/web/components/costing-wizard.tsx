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
  objetivo: BusinessConfigurationInput["objetivo"];
  madurezDatos: BusinessConfigurationInput["madurez_datos"];
  condicionFiscal: BusinessConfigurationInput["condicion_fiscal"];
  capacidadNormalHoras: string;
  alicuotaImpuestoResultado: string;
  aceptaTerminos: boolean;
}

interface ProductForm {
  key: number;
  codigo: string;
  nombre: string;
  origen: Extract<OrigenItem, "comprado" | "fabricado" | "mixto">;
  unidadesVendidas: string;
  precioVentaNeto: string;
  costoCompraNeto: string;
  costoMaterialNeto: string;
  cantidadMaterial: string;
  merma: string;
  horasMod: string;
  costoHoraMod: string;
  participacionComprada: string;
}

interface PeriodCostForm {
  key: number;
  nombre: string;
  categoria: "produccion" | "administracion" | "comercializacion" | "logistica" | "generales";
  montoNeto: string;
  comportamiento: "fijo" | "variable";
  driver: DriverKind;
}

const initialConfiguration: ConfigurationForm = {
  tipoActividad: "fabricacion",
  objetivo: "ambos",
  madurezDatos: "inicial",
  condicionFiscal: "responsable_inscripto",
  capacidadNormalHoras: "160",
  alicuotaImpuestoResultado: "",
  aceptaTerminos: false
};

function makeProduct(key: number, activity: ConfigurationForm["tipoActividad"]): ProductForm {
  const origin = activity === "reventa" ? "comprado" : activity === "mixto" ? "mixto" : "fabricado";
  return {
    key,
    codigo: `SKU-${String(key).padStart(3, "0")}`,
    nombre: key === 1 ? "Producto principal" : `Producto ${key}`,
    origen: origin,
    unidadesVendidas: "100",
    precioVentaNeto: "2000",
    costoCompraNeto: "1200",
    costoMaterialNeto: "1000",
    cantidadMaterial: "1",
    merma: "0.05",
    horasMod: "0.5",
    costoHoraMod: "2400",
    participacionComprada: "0.25"
  };
}

const initialCosts: PeriodCostForm[] = [
  {
    key: 1,
    nombre: "Estructura productiva",
    categoria: "produccion",
    montoNeto: "20000",
    comportamiento: "fijo",
    driver: "horas_mod"
  },
  {
    key: 2,
    nombre: "Administración general",
    categoria: "administracion",
    montoNeto: "15000",
    comportamiento: "fijo",
    driver: "ventas_netas"
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
  unidades_vendidas: "Unidades vendidas",
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

function recommendationFor(category: PeriodCostForm["categoria"]): { driver: DriverKind; reason: string } {
  if (category === "produccion") return { driver: "horas_mod", reason: "Relaciona la estructura productiva con el tiempo requerido por cada SKU." };
  if (category === "logistica") return { driver: "unidades_vendidas", reason: "Aproxima el esfuerzo logístico mediante el volumen despachado." };
  if (category === "comercializacion") return { driver: "ventas_netas", reason: "Relaciona el costo comercial con el valor vendido." };
  if (category === "administracion") return { driver: "ventas_netas", reason: "Proxy simple y visible para el tier gratuito." };
  return { driver: "uniforme", reason: "Se usa cuando no existe una base causal más representativa." };
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

  const input = useMemo<CalculationInput>(() => {
    const items: ItemInput[] = [];
    for (const product of products) {
      const productId = idFor(1000 + product.key);
      const rawId = idFor(2000 + product.key);
      const purchaseId = idFor(3000 + product.key);
      const laborId = idFor(4000 + product.key);
      const isManufactured = product.origen === "fabricado" || product.origen === "mixto";
      const isPurchased = product.origen === "comprado" || product.origen === "mixto";

      if (isManufactured) {
        items.push({
          item_id: rawId,
          codigo: `MP-${String(product.key).padStart(3, "0")}`,
          nombre: `Material principal · ${product.nombre}`,
          tipo_item: "materia_prima",
          origen_item: "comprado",
          vendible: false,
          inventariable: true,
          unidad_base_id: UNIT_ID,
          compras: [{
            compra_id: idFor(5000 + product.key),
            cantidad_base: "1",
            precio_neto_unitario: product.costoMaterialNeto
          }]
        });
      }

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
            componentes: [{
              item_componente_id: rawId,
              cantidad_neta: product.cantidadMaterial,
              merma_estandar: product.merma
            }]
          },
          mano_obra: [{
            rol_id: laborId,
            horas_estandar: product.horasMod,
            costo_hora_completo: product.costoHoraMod,
            comportamiento: "variable" as const
          }]
        } : {}),
        ...(product.origen === "mixto" ? { participacion_comprada: product.participacionComprada } : {}),
        venta: {
          cantidad_base: product.unidadesVendidas,
          precio_neto_unitario: product.precioVentaNeto
        }
      });
    }

    return {
      schema_version: "2026-07-31.beta2",
      calculation_id: crypto.randomUUID(),
      configuracion: {
        tipo_actividad: configuration.tipoActividad,
        objetivo: configuration.objetivo,
        madurez_datos: configuration.madurezDatos,
        condicion_fiscal: configuration.condicionFiscal,
        canal_default: "venta_general",
        importes_sin_iva: true,
        ...(configuration.alicuotaImpuestoResultado.trim() === ""
          ? {}
          : { alicuota_impuesto_resultado: configuration.alicuotaImpuestoResultado })
      },
      moneda_base: "ARS",
      ...(configuration.tipoActividad === "reventa" || configuration.capacidadNormalHoras.trim() === ""
        ? {}
        : { capacidad_normal_horas: configuration.capacidadNormalHoras }),
      items,
      costos: costs.map((cost) => ({
        costo_id: idFor(6000 + cost.key),
        nombre: cost.nombre,
        categoria: cost.categoria,
        monto_neto_total: cost.montoNeto,
        trazabilidad: "indirecto" as const,
        comportamiento: cost.comportamiento,
        driver: { tipo: cost.driver }
      }))
    };
  }, [configuration, costs, products]);

  const changeActivity = (activity: ConfigurationForm["tipoActividad"]) => {
    setConfiguration((current) => ({ ...current, tipoActividad: activity }));
    setProducts((current) => current.map((product) => ({
      ...product,
      origen: originForActivity(activity, product.origen)
    })));
    if (activity === "reventa") {
      setCosts((current) => current.filter((cost) => cost.categoria !== "produccion"));
    } else if (!costs.some((cost) => cost.categoria === "produccion")) {
      setCosts((current) => [initialCosts[0] as PeriodCostForm, ...current]);
    }
    setResult(null);
  };

  const updateConfiguration = <K extends keyof ConfigurationForm>(field: K, value: ConfigurationForm[K]) => {
    setConfiguration((current) => ({ ...current, [field]: value }));
    setResult(null);
  };

  const updateProduct = <K extends keyof ProductForm>(key: number, field: K, value: ProductForm[K]) => {
    setProducts((current) => current.map((product) => product.key === key ? { ...product, [field]: value } : product));
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
    setCosts((current) => current.map((cost) => {
      if (cost.key !== key) return cost;
      if (field === "categoria") {
        const category = value as PeriodCostForm["categoria"];
        return { ...cost, categoria: category, driver: recommendationFor(category).driver };
      }
      return { ...cost, [field]: value };
    }));
    setResult(null);
  };

  const addCost = () => {
    const key = nextCostKey.current++;
    setCosts((current) => [...current, {
      key,
      nombre: "Nuevo costo del período",
      categoria: "generales",
      montoNeto: "0",
      comportamiento: "fijo",
      driver: "uniforme"
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
    setConfiguration({
      tipoActividad: imported.configuracion.tipo_actividad,
      objetivo: imported.configuracion.objetivo,
      madurezDatos: imported.configuracion.madurez_datos,
      condicionFiscal: imported.configuracion.condicion_fiscal,
      capacidadNormalHoras: imported.capacidad_normal_horas ?? "",
      alicuotaImpuestoResultado: imported.configuracion.alicuota_impuesto_resultado ?? "",
      aceptaTerminos: true
    });
    const byId = new Map(imported.items.map((item) => [item.item_id, item]));
    const importedProducts = imported.items.filter((item) => item.vendible).slice(0, 5).map((item, index): ProductForm => {
      const component = item.receta?.componentes[0];
      const raw = component === undefined ? undefined : byId.get(component.item_componente_id);
      return {
        key: index + 1,
        codigo: item.codigo,
        nombre: item.nombre,
        origen: item.origen_item === "mixto" ? "mixto" : item.origen_item === "fabricado" ? "fabricado" : "comprado",
        unidadesVendidas: item.venta?.cantidad_base ?? "0",
        precioVentaNeto: item.venta?.precio_neto_unitario ?? "0",
        costoCompraNeto: item.compras?.[0]?.precio_neto_unitario ?? "0",
        costoMaterialNeto: raw?.compras?.[0]?.precio_neto_unitario ?? "0",
        cantidadMaterial: component?.cantidad_neta ?? "1",
        merma: component?.merma_estandar ?? "0",
        horasMod: item.mano_obra?.[0]?.horas_estandar ?? "0",
        costoHoraMod: item.mano_obra?.[0]?.costo_hora_completo ?? "0",
        participacionComprada: item.participacion_comprada ?? "0.5"
      };
    });
    setProducts(importedProducts.length > 0 ? importedProducts : [makeProduct(1, imported.configuracion.tipo_actividad)]);
    setCosts(imported.costos.map((cost, index) => ({
      key: index + 1,
      nombre: cost.nombre,
      categoria: (["produccion", "administracion", "comercializacion", "logistica", "generales"] as const).includes(cost.categoria as PeriodCostForm["categoria"])
        ? cost.categoria as PeriodCostForm["categoria"]
        : "generales",
      montoNeto: cost.monto_neto_total,
      comportamiento: cost.comportamiento,
      driver: cost.driver?.tipo ?? "uniforme"
    })));
    nextProductKey.current = importedProducts.length + 1;
    nextCostKey.current = imported.costos.length + 1;
  };

  const importNativeFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await readNativeFile(file);
      hydrateFromInput(imported);
      setWorking(true);
      setResult(null);
      workerRef.current?.postMessage({ ...imported, calculation_id: crypto.randomUUID() });
      setFileMessage("Archivo validado e importado; la sesión se migró a importes sin IVA y se recalculó.");
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
        {(Object.keys(stepLabels) as WizardStep[]).map((item, index) => (
          <button
            className={step === item ? "active" : ""}
            disabled={item === "resultados" && result === null}
            key={item}
            onClick={() => setStep(item)}
            type="button"
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {stepLabels[item]}
          </button>
        ))}
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
                  Objetivo de esta sesión
                  <select value={configuration.objetivo} onChange={(event) => updateConfiguration("objetivo", event.target.value as ConfigurationForm["objetivo"])}>
                    <option value="conocer_costos">Conocer costos por producto</option>
                    <option value="analizar_rentabilidad">Analizar rentabilidad</option>
                    <option value="ambos">Costos y rentabilidad</option>
                  </select>
                </label>
                <label>
                  Madurez de los datos
                  <select value={configuration.madurezDatos} onChange={(event) => updateConfiguration("madurezDatos", event.target.value as ConfigurationForm["madurezDatos"])}>
                    <option value="inicial">Inicial · datos aproximados</option>
                    <option value="intermedia">Intermedia · registros parciales</option>
                    <option value="ordenada">Ordenada · datos periódicos</option>
                  </select>
                </label>
                <label>
                  Condición fiscal
                  <select value={configuration.condicionFiscal} onChange={(event) => updateConfiguration("condicionFiscal", event.target.value as ConfigurationForm["condicionFiscal"])}>
                    <option value="responsable_inscripto">Responsable inscripto</option>
                    <option value="monotributista">Monotributista</option>
                    <option value="exento">Exento</option>
                  </select>
                </label>
                <label>
                  Alícuota estimada sobre el resultado <em>opcional</em>
                  <input inputMode="decimal" value={configuration.alicuotaImpuestoResultado} onChange={(event) => updateConfiguration("alicuotaImpuestoResultado", event.target.value)} />
                  <small>Ejemplo: 0,30 se carga como 0.30.</small>
                </label>
                {configuration.tipoActividad !== "reventa" && (
                  <label>
                    Capacidad normal del período <em>horas</em>
                    <input inputMode="decimal" value={configuration.capacidadNormalHoras} onChange={(event) => updateConfiguration("capacidadNormalHoras", event.target.value)} />
                    <small>Habilita costo productivo normal y variación de capacidad.</small>
                  </label>
                )}
              </div>

              <aside className="net-policy">
                <strong>Política de importes</strong>
                <p>Todos los costos, gastos y precios se cargan <b>sin IVA</b>. La condición fiscal queda registrada como contexto de la sesión.</p>
              </aside>

              <label className="consent-check">
                <input checked={configuration.aceptaTerminos} onChange={(event) => setConfiguration((current) => ({ ...current, aceptaTerminos: event.target.checked }))} type="checkbox" />
                <span>Acepto iniciar una sesión temporal sin persistencia en servidor.</span>
              </label>

              <div className="flow-actions">
                <label className="file-input compact">Abrir archivo anterior<input type="file" accept=".zip,.costeo" onChange={importNativeFile} /></label>
                <button disabled={!configuration.aceptaTerminos} onClick={() => setStep("productos")} type="button">Continuar con productos</button>
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
                        <label>Unidades vendidas<input inputMode="decimal" value={product.unidadesVendidas} onChange={(event) => updateProduct(product.key, "unidadesVendidas", event.target.value)} /></label>
                        <label>Precio de venta unitario <em>sin IVA</em><input inputMode="decimal" value={product.precioVentaNeto} onChange={(event) => updateProduct(product.key, "precioVentaNeto", event.target.value)} /></label>
                        {showPurchase && <label>Costo de compra unitario <em>sin IVA</em><input inputMode="decimal" value={product.costoCompraNeto} onChange={(event) => updateProduct(product.key, "costoCompraNeto", event.target.value)} /></label>}
                        {product.origen === "mixto" && <label>Participación comprada <em>fracción</em><input inputMode="decimal" value={product.participacionComprada} onChange={(event) => updateProduct(product.key, "participacionComprada", event.target.value)} /></label>}
                      </div>
                      {showManufacturing && (
                        <div className="subsection">
                          <div><strong>Receta estándar y MOD promedio</strong><span>Un componente principal en este primer corte conciliado.</span></div>
                          <div className="form-grid three-columns">
                            <label>Costo material unitario <em>sin IVA</em><input inputMode="decimal" value={product.costoMaterialNeto} onChange={(event) => updateProduct(product.key, "costoMaterialNeto", event.target.value)} /></label>
                            <label>Cantidad neta por unidad<input inputMode="decimal" value={product.cantidadMaterial} onChange={(event) => updateProduct(product.key, "cantidadMaterial", event.target.value)} /></label>
                            <label>Merma estándar <em>fracción</em><input inputMode="decimal" value={product.merma} onChange={(event) => updateProduct(product.key, "merma", event.target.value)} /></label>
                            <label>Horas MOD por unidad<input inputMode="decimal" value={product.horasMod} onChange={(event) => updateProduct(product.key, "horasMod", event.target.value)} /></label>
                            <label>Costo completo por hora <em>sin IVA</em><input inputMode="decimal" value={product.costoHoraMod} onChange={(event) => updateProduct(product.key, "costoHoraMod", event.target.value)} /></label>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              <button className="secondary add-button" disabled={products.length >= 5} onClick={addProduct} type="button">+ Agregar otro SKU</button>
              <div className="flow-actions">
                <button className="secondary" onClick={() => setStep("diagnostico")} type="button">Volver</button>
                <button onClick={() => setStep("costos")} type="button">Continuar con costos</button>
              </div>
            </section>
          )}

          {step === "costos" && (
            <section className="panel flow-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Costos por categoría</p>
                  <h2>Costos y gastos del período</h2>
                  <p>Cargalos sin IVA. Recomendamos un driver visible para cada categoría.</p>
                </div>
              </div>

              <div className="cost-list">
                {costs.map((cost) => {
                  const recommendation = recommendationFor(cost.categoria);
                  return (
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
                          </select>
                        </label>
                        <label>Monto total <em>sin IVA</em><input inputMode="decimal" value={cost.montoNeto} onChange={(event) => updateCost(cost.key, "montoNeto", event.target.value)} /></label>
                        <label>
                          Comportamiento
                          <select value={cost.comportamiento} onChange={(event) => updateCost(cost.key, "comportamiento", event.target.value as PeriodCostForm["comportamiento"])}>
                            <option value="fijo">Fijo</option>
                            <option value="variable">Variable</option>
                          </select>
                        </label>
                        <label>
                          Driver de asignación
                          <select value={cost.driver} onChange={(event) => updateCost(cost.key, "driver", event.target.value as DriverKind)}>
                            {Object.entries(driverLabels).filter(([key]) => key !== "manual").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                        </label>
                      </div>
                      <p className={`driver-note ${cost.driver === recommendation.driver ? "recommended" : "conventional"}`}>
                        <b>{cost.driver === recommendation.driver ? "Driver recomendado" : "Alternativa elegida"}:</b> {recommendation.reason}
                        {cost.driver !== recommendation.driver && " La asignación puede ser convencional y quedará visible en resultados."}
                      </p>
                    </article>
                  );
                })}
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
                      <h2>{products.length} SKU · {money(result.resultado_empresa)}</h2>
                      <p>Resultado operativo total. {warningCount > 0 ? `${warningCount} observación metodológica.` : "Sin observaciones pendientes."}</p>
                    </div>
                    <div className="result-actions">
                      <button className="secondary" onClick={() => setStep("costos")} type="button">Editar datos</button>
                      <button onClick={downloadNativeFile} type="button">Guardar archivo local</button>
                    </div>
                  </section>

                  <section className="panel layers-panel">
                    <div className="section-heading compact-heading"><div><p className="section-kicker">Resultados por capas</p><h3>Qué pudo calcularse</h3></div></div>
                    <div className="layer-grid">
                      {result.capas_resultado.map((layer) => (
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
                            <div><dt>Contribución marginal</dt><dd>{money(item.contribucion_marginal)}</dd></div>
                            <div><dt>Costo productivo normal unitario</dt><dd>{money(item.costo_productivo_normal_unitario)}</dd></div>
                            <div><dt>Costo completo unitario</dt><dd>{money(item.costo_completo_unitario_gerencial)}</dd></div>
                            <div><dt>Precio umbral de contribución cero</dt><dd>{money(item.precio_umbral_contribucion_cero)}</dd></div>
                            <div><dt>Resultado neto estimado</dt><dd>{money(item.resultado_neto_estimado)}</dd></div>
                          </dl>
                        </section>
                      );
                    })}
                  </div>

                  {result.capacidad && (
                    <section className="panel capacity-panel">
                      <div><p className="section-kicker">Capacidad normal</p><h3>Absorción productiva</h3></div>
                      <dl className="breakdown four">
                        <div><dt>Horas normales</dt><dd>{result.capacidad.horas_normales}</dd></div>
                        <div><dt>Horas aplicadas</dt><dd>{result.capacidad.horas_aplicadas}</dd></div>
                        <div><dt>Tasa fija por hora</dt><dd>{money(result.capacidad.tasa_fija_productiva_normal)}</dd></div>
                        <div><dt>Variación de capacidad</dt><dd>{money(result.capacidad.variacion_capacidad)}</dd></div>
                      </dl>
                    </section>
                  )}

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
            </dl>
          </section>
          <section className="panel guidance-card">
            <p className="section-kicker">Plan de carga</p>
            <ol>
              <li className={configuration.aceptaTerminos ? "done" : ""}>Configurar negocio</li>
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
