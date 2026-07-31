export async function persistRunResult(client, payload) {
    if (!payload.result.ok) {
        await client.query(`update ops.job
          set estado = 'fallido', finished_at = now(),
              error_code = 'CALCULATION_VALIDATION_ERROR', error_detail = $3
        where empresa_id = $1 and job_id = $2`, [payload.empresa_id, payload.job_id, JSON.stringify(payload.result.validaciones)]);
        return;
    }
    await client.query(`insert into calc.snapshot (empresa_id, corrida_version_id, schema_version, engine_version, hash_raiz, completo)
     values ($1, $2, $3, $4, $5, true)
     on conflict (empresa_id, corrida_version_id) do nothing`, [payload.empresa_id, payload.corrida_version_id, payload.input.schema_version, payload.result.engine_version, payload.root_hash]);
    const snapshot = await client.query(`select snapshot_id from calc.snapshot
      where empresa_id = $1 and corrida_version_id = $2 and hash_raiz = $3`, [payload.empresa_id, payload.corrida_version_id, payload.root_hash]);
    const snapshotId = snapshot.rows[0]?.snapshot_id;
    if (!snapshotId)
        throw new Error("No se pudo crear el snapshot de la corrida.");
    await client.query(`insert into calc.snapshot_seccion (empresa_id, snapshot_id, codigo_seccion, schema_version, contenido_json, hash_seccion)
     values ($1, $2, 'input', $3, $4::jsonb, $5),
            ($1, $2, 'result', $3, $6::jsonb, $7)
     on conflict (empresa_id, snapshot_id, codigo_seccion) do nothing`, [payload.empresa_id, snapshotId, payload.input.schema_version, JSON.stringify(payload.input), payload.input_hash, JSON.stringify(payload.result), payload.result_hash]);
    for (const item of payload.result.resultados_item) {
        const metrics = {
            "resultado.ventas_netas": item.ventas_netas,
            "resultado.costo_directo": item.costo_directo,
            "resultado.costo_variable_total": item.costo_variable_total,
            "resultado.margen_bruto": item.margen_bruto,
            "resultado.contribucion_marginal": item.contribucion_marginal,
            "resultado.resultado_operativo": item.resultado_operativo_trazabilidad
        };
        for (const [code, value] of Object.entries(metrics)) {
            await client.query(`insert into calc.resultado_metrica
          (empresa_id, corrida_version_id, item_id, catalogo_metrica_id, valor_numerico)
         select $1, $2, $3, catalogo_metrica_id, $5::numeric
           from calc.catalogo_metrica where codigo = $4
         on conflict (empresa_id, corrida_version_id, item_id, catalogo_metrica_id)
         do nothing`, [payload.empresa_id, payload.corrida_version_id, item.item_id, code, value]);
        }
    }
    await client.query(`update calc.corrida_version
        set estado = 'calculada', hash_resultado = $3, calculada_at = now()
      where empresa_id = $1 and corrida_version_id = $2`, [payload.empresa_id, payload.corrida_version_id, payload.result_hash]);
    await client.query(`update ops.job set estado = 'completado', finished_at = now()
      where empresa_id = $1 and job_id = $2`, [payload.empresa_id, payload.job_id]);
}
//# sourceMappingURL=calculation-repository.js.map