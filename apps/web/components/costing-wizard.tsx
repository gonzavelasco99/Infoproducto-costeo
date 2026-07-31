"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalculationInput, CalculationOutcome } from "@costeo/domain";
import { createNativeFile, readNativeFile } from "../app/native-file";

const IDS = {
  unidad: "00000000-0000-4000-8000-000000000001",
  materiaPrima: "00000000-0000-4000-8000-000000000002",
  producto: "00000000-0000-4000-8000-000000000003",
  compra: "00000000-0000-4000-8000-000000000004",
  rol: "00000000-0000-4000-8000-000000000005",
  costo: "00000000-0000-4000-8000-000000000006"
} as const;

type FormState = {
  unidades: string;
  precioVentaBruto: string;
  costoMateriaPrimaBruto: string;
  cantidadMateriaPrima: string;
  merma: string;
  horas: string;
  tarifaHora: string;
  indirectos: string;
};

const initial: FormState = {
  unidades: "100",
  precioVentaBruto: "2420",
  costoMateriaPrimaBruto: "1210",
  cantidadMateriaPrima: "1",
  merma: "0.05",
  horas: "0.5",
  tarifaHora: "2400",
  indirectos: "35000"
};

function money(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(value));
}

export function CostingWizard() {
  const [form, setForm] = useState<FormState>(initial);
  const [result, setResult] = useState<CalculationOutcome | null>(null);
  const [working, setWorking] = useState(false);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../app/calculation.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<CalculationOutcome>) => {
      setResult(event.data);
      setWorking(false);
    };
    worker.onerror = () => {
      setWorking(false);
      setResult(null);
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const input = useMemo<CalculationInput>(() => ({
    schema_version: "2026-07-27.beta1",
    calculation_id: crypto.randomUUID(),
    moneda_base: "ARS",
    items: [
      {
        item_id: IDS.materiaPrima,
        codigo: "MP-001",
        nombre: "Materia prima principal",
        tipo_item: "materia_prima",
        origen_item: "comprado",
        vendible: false,
        inventariable: true,
        unidad_base_id: IDS.unidad,
        compras: [{
          compra_id: IDS.compra,
          cantidad_base: "1",
          precio_bruto_unitario: form.costoMateriaPrimaBruto,
          alicuota_iva: "0.21",
          tratamiento_iva: "computable"
        }]
      },
      {
        item_id: IDS.producto,
        codigo: "PT-001",
        nombre: "Producto terminado",
        tipo_item: "producto_final",
        origen_item: "fabricado",
        vendible: true,
        inventariable: true,
        unidad_base_id: IDS.unidad,
        receta: {
          cantidad_salida_base: "1",
          componentes: [{
            item_componente_id: IDS.materiaPrima,
            cantidad_neta: form.cantidadMateriaPrima,
            merma_estandar: form.merma
          }]
        },
        mano_obra: [{
          rol_id: IDS.rol,
          horas_estandar: form.horas,
          costo_hora_completo: form.tarifaHora,
          comportamiento: "variable"
        }],
        venta: {
          cantidad_base: form.unidades,
          precio_bruto_unitario: form.precioVentaBruto,
          alicuota_iva: "0.21"
        }
      }
    ],
    costos: [{
      costo_id: IDS.costo,
      nombre: "Costos indirectos del período",
      categoria: "administracion",
      monto_total: form.indirectos,
      trazabilidad: "indirecto",
      comportamiento: "fijo",
      driver: { tipo: "ventas_netas" }
    }]
  }), [form]);

  const update = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const calculateNow = () => {
    setWorking(true);
    setResult(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
    if (!apiUrl) {
      workerRef.current?.postMessage(input);
      return;
    }

    void fetch(`${apiUrl}/v1/calculations/free`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    })
      .then(async (response) => {
        const payload = await response.json() as { data?: CalculationOutcome };
        if (!response.ok || !payload.data) throw new Error("La API no pudo calcular el resultado.");
        setResult(payload.data);
      })
      .catch(() => {
        workerRef.current?.postMessage(input);
        setFileMessage("La API no respondió; se aplicó el cálculo local.");
      })
      .finally(() => setWorking(false));
  };

  const downloadNativeFile = async () => {
    const blob = await createNativeFile(input);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "costeo-beta.costeo.zip";
    anchor.click();
    URL.revokeObjectURL(url);
    setFileMessage("Archivo local exportado. Incluye contrato y hash de integridad.");
  };

  const importNativeFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await readNativeFile(file);
      setWorking(true);
      setResult(null);
      workerRef.current?.postMessage({ ...imported, calculation_id: crypto.randomUUID() });
      setFileMessage("Archivo validado e importado; los resultados se recalcularon.");
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      event.target.value = "";
    }
  };

  const itemResult = result?.ok ? result.resultados_item[0] : undefined;

  return (
    <section className="workspace" aria-label="Calculadora de costeo">
      <form className="panel" onSubmit={(event) => { event.preventDefault(); calculateNow(); }}>
        <div className="panel-title">
          <span>01</span>
          <div><h2>Datos del producto</h2><p>Importes con IVA 21% incluido.</p></div>
        </div>
        <div className="grid">
          <label>Unidades vendidas<input inputMode="decimal" value={form.unidades} onChange={update("unidades")} /></label>
          <label>Precio bruto unitario<input inputMode="decimal" value={form.precioVentaBruto} onChange={update("precioVentaBruto")} /></label>
          <label>Costo bruto de materia prima<input inputMode="decimal" value={form.costoMateriaPrimaBruto} onChange={update("costoMateriaPrimaBruto")} /></label>
          <label>Cantidad neta por unidad<input inputMode="decimal" value={form.cantidadMateriaPrima} onChange={update("cantidadMateriaPrima")} /></label>
          <label>Merma (fracción)<input inputMode="decimal" value={form.merma} onChange={update("merma")} /></label>
          <label>Horas MOD por unidad<input inputMode="decimal" value={form.horas} onChange={update("horas")} /></label>
          <label>Costo completo por hora<input inputMode="decimal" value={form.tarifaHora} onChange={update("tarifaHora")} /></label>
          <label>Indirectos fijos del período<input inputMode="decimal" value={form.indirectos} onChange={update("indirectos")} /></label>
        </div>
        <button type="submit" disabled={working}>{working ? "Calculando…" : "Calcular rentabilidad"}</button>
        <div className="file-actions">
          <button className="secondary" type="button" onClick={downloadNativeFile}>Guardar archivo local</button>
          <label className="file-input">Abrir archivo local<input type="file" accept=".zip,.costeo" onChange={importNativeFile} /></label>
        </div>
        {fileMessage && <p className="file-message">{fileMessage}</p>}
        <p className="privacy">Sin registro · sin persistencia en servidor · precisión decimal interna</p>
      </form>

      <section className="panel results" aria-live="polite">
        <div className="panel-title">
          <span>02</span>
          <div><h2>Resultado conciliado</h2><p>Vista de trazabilidad y comportamiento.</p></div>
        </div>
        {!result && <div className="empty">Completá los datos y ejecutá el cálculo.</div>}
        {result && !result.ok && (
          <div className="errors">
            <h3>Hay datos por corregir</h3>
            <ul>{result.validaciones.map((entry) => <li key={`${entry.codigo}-${entry.source_path}`}>{entry.codigo}: {entry.mensaje}</li>)}</ul>
          </div>
        )}
        {result?.ok && itemResult && (
          <>
            <div className="kpis">
              <article><span>Ventas netas</span><strong>{money(itemResult.ventas_netas)}</strong></article>
              <article><span>Costo directo</span><strong>{money(itemResult.costo_directo)}</strong></article>
              <article className="accent"><span>Resultado operativo</span><strong>{money(itemResult.resultado_operativo_trazabilidad)}</strong></article>
              <article><span>Margen operativo</span><strong>{itemResult.margen_operativo_porcentual === null ? "—" : `${(Number(itemResult.margen_operativo_porcentual) * 100).toFixed(1)}%`}</strong></article>
            </div>
            <dl className="breakdown">
              <div><dt>Margen bruto</dt><dd>{money(itemResult.margen_bruto)}</dd></div>
              <div><dt>Contribución marginal</dt><dd>{money(itemResult.contribucion_marginal)}</dd></div>
              <div><dt>Indirectos asignados</dt><dd>{money(itemResult.costo_indirecto_operativo_asignado)}</dd></div>
              <div><dt>Costo completo unitario</dt><dd>{money(itemResult.costo_completo_unitario_gerencial)}</dd></div>
            </dl>
            <div className={result.conciliacion.conciliado ? "reconcile ok" : "reconcile bad"}>
              <strong>{result.conciliacion.conciliado ? "Conciliación OK" : "Revisar conciliación"}</strong>
              <span>Diferencia entre vistas: {money(result.conciliacion.diferencia_vistas)}</span>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
