-- Concilia el catálogo persistente con el motor 0.2.0 / contrato beta2.
-- Las sesiones gratuitas siguen siendo locales; estos registros documentan
-- las métricas que podrán persistirse en corridas autenticadas.

begin;

update calc.version_motor
   set estado = 'retirada'
 where estado = 'activa'
   and not (version_semantica = '0.2.0' and version_esquema = '2026-07-31.beta2');

insert into calc.version_motor (
  version_semantica,
  version_esquema,
  fecha_publicacion,
  hash_codigo,
  estado,
  notas
)
values (
  '0.2.0',
  '2026-07-31.beta2',
  '2026-08-06',
  repeat('0', 64),
  'activa',
  'Importes sin IVA, receta multicomponente, MOD por horas disponibles, estado de resultados y eficiencia de mano de obra.'
)
on conflict (version_semantica, version_esquema) do update
set fecha_publicacion = excluded.fecha_publicacion,
    estado = excluded.estado,
    notas = excluded.notas;

insert into calc.catalogo_metrica (codigo, nombre, unidad_tipo, version_motor_desde)
values
  ('resultado.costo_indirecto_absorbido', 'Costo indirecto absorbido', 'moneda', '0.2.0'),
  ('resultado.costo_directo_unitario', 'Costo directo unitario', 'moneda_por_unidad', '0.2.0'),
  ('resultado.costo_indirecto_unitario', 'Costo indirecto unitario', 'moneda_por_unidad', '0.2.0'),
  ('resultado.costo_unitario_total', 'Costo unitario total', 'moneda_por_unidad', '0.2.0'),
  ('resultado.margen_neto', 'Margen neto', 'moneda', '0.2.0'),
  ('mod.horas_ocupadas', 'Horas MOD ocupadas', 'horas', '0.2.0'),
  ('mod.horas_disponibles', 'Horas MOD disponibles', 'horas', '0.2.0'),
  ('mod.cociente_ocupacion', 'Cociente de ocupación de MOD', 'proporcion', '0.2.0')
on conflict (codigo) do update
set nombre = excluded.nombre,
    unidad_tipo = excluded.unidad_tipo,
    version_motor_desde = excluded.version_motor_desde,
    activa = true;

commit;
