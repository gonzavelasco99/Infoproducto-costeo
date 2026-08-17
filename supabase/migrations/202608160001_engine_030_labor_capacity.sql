begin;

update calc.version_motor
set estado = 'retirada'
where estado = 'activa'
  and version_semantica <> '0.3.0';

insert into calc.version_motor (
  version_semantica,
  version_esquema,
  fecha_publicacion,
  hash_codigo,
  estado,
  notas
)
values (
  '0.3.0',
  '2026-07-31.beta2',
  '2026-08-16',
  repeat('0', 64),
  'activa',
  'MOD distribuida por participación de horas productivas de cada SKU y control de capacidad contratada.'
)
on conflict (version_semantica, version_esquema) do update
set fecha_publicacion = excluded.fecha_publicacion,
    hash_codigo = excluded.hash_codigo,
    estado = excluded.estado,
    notas = excluded.notas;

insert into calc.catalogo_metrica (codigo, nombre, unidad_tipo, version_motor_desde)
values ('resultado.costo_mod_unitario', 'Costo unitario de MOD', 'moneda_por_unidad', '0.3.0')
on conflict (codigo) do update
set nombre = excluded.nombre,
    unidad_tipo = excluded.unidad_tipo,
    version_motor_desde = excluded.version_motor_desde,
    activa = true;

commit;
