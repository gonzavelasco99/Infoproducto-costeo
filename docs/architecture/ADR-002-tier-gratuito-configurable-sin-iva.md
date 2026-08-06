# ADR-002 — Tier gratuito configurable e importes sin IVA

Estado: aceptada e implementada en el primer corte de remediación  
Fecha: 2026-07-31

## Contexto

La auditoría funcional detectó que la interfaz gratuita representaba un único caso patrón de fabricación con IVA 21 % fijo. Los recursos aprobados definen un diagnóstico inicial, divulgación progresiva, configuración para fabricación, reventa o actividad mixta, drivers visibles y resultados por capas.

La decisión de producto confirmada establece además que costos, gastos y precios se cargan sin IVA.

## Decisión

1. El contrato vigente es `2026-07-31.beta2`.
2. Toda sesión contiene `configuracion` con actividad, objetivo, madurez de datos, condición fiscal, canal general y la invariante `importes_sin_iva: true`.
3. Las entradas monetarias económicas son explícitas: `precio_neto_unitario`, `descuento_neto_total`, `costo_adquisicion_neto_total` y `monto_neto_total`.
4. No se solicita alícuota de IVA en la carga operativa. La condición fiscal se conserva como contexto, no como instrucción para sumar o descontar IVA de los importes ingresados.
5. El tier gratuito ejecuta el motor en un Web Worker. La API conserva el mismo contrato para usos posteriores, pero no es necesaria para calcular localmente.
6. El asistente genera los campos aplicables según la actividad: reventa omite BOM, MOD y capacidad; fabricación los habilita; mixto permite definir el origen de cada SKU.
7. Las validaciones exponen código, tipo, fase, alcance afectado y remediación. Un error de conciliación devuelve una corrida fallida y no un resultado exitoso.
8. Los resultados indican por capa si pudieron calcularse. La capacidad normal y la alícuota estimada de impuesto al resultado son opcionales y habilitan sus respectivas capas.

## Compatibilidad

Los archivos nativos `2026-07-27.beta1` se validan primero contra su hash original y luego se migran. Los importes brutos con IVA computable se convierten a su valor económico neto para conservar los resultados anteriores; los demás tratamientos preservan el importe económico utilizado por el motor previo.

Los nuevos archivos se exportan exclusivamente como `2026-07-31.beta2`.

## Alcance pendiente

Este corte no completa todavía las 243 validaciones ni las 61 fórmulas gratuitas o compartidas. Permanecen pendientes el editor BOM multinivel completo, productos intermedios editables, compras múltiples por período, unidades/conversiones, semivariables, aceptación explícita de fallbacks y trazabilidad navegable hasta cada fórmula y fuente.
