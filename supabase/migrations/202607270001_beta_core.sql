-- Primer corte vertical del MVP de costeo organizacional.
-- PostgreSQL/Supabase: autenticación delegada a auth.users; no se almacena password_hash.

create extension if not exists pgcrypto;

create schema if not exists app_private;
create schema if not exists billing;
create schema if not exists core;
create schema if not exists ref;
create schema if not exists costing;
create schema if not exists calc;
create schema if not exists audit;
create schema if not exists ops;

create or replace function app_private.current_empresa_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.empresa_id', true), '')::uuid
$$;

create table billing.plan (
  plan_id uuid primary key default gen_random_uuid(),
  codigo varchar(40) not null unique,
  nombre varchar(120) not null,
  estado varchar(40) not null default 'activo' check (estado in ('activo', 'retirado')),
  created_at timestamptz not null default now()
);

create table billing.plan_limite (
  plan_limite_id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references billing.plan(plan_id),
  codigo varchar(80) not null,
  valor numeric(24,10) not null check (valor >= 0),
  unidad varchar(40) not null,
  unique (plan_id, codigo)
);

create table ref.moneda (
  moneda_id uuid primary key default gen_random_uuid(),
  codigo char(3) not null unique,
  nombre varchar(120) not null,
  decimales smallint not null default 2 check (decimales between 0 and 8),
  activa boolean not null default true
);

create table core.empresa (
  empresa_id uuid primary key default gen_random_uuid(),
  codigo varchar(80) not null unique,
  razon_social varchar(180) not null,
  nombre_fantasia varchar(180),
  estado varchar(40) not null default 'activa' check (estado in ('activa', 'suspendida', 'pendiente_eliminacion', 'anonimizada')),
  moneda_base_id uuid not null references ref.moneda(moneda_id),
  condicion_fiscal varchar(40) not null default 'responsable_inscripto' check (condicion_fiscal in ('responsable_inscripto', 'monotributista', 'exento')),
  tratamiento_iva_compra_default varchar(40) not null default 'computable' check (tratamiento_iva_compra_default in ('computable', 'integra_costo', 'no_aplica')),
  tratamiento_iva_venta_default varchar(40) not null default 'computable' check (tratamiento_iva_venta_default in ('computable', 'integra_costo', 'no_aplica')),
  timezone varchar(64) not null default 'America/Argentina/Cordoba',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (empresa_id)
);

-- Mapeo explícito: auth.usuario del diccionario = auth.users + este perfil.
create table core.usuario_perfil (
  usuario_id uuid primary key references auth.users(id) on delete restrict,
  nombre varchar(120) not null,
  apellido varchar(120),
  activo boolean not null default true,
  locked_admin_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mapeo explícito: auth.usuario_empresa se ubica en core para no modificar el schema administrado por Supabase Auth.
create table core.usuario_empresa (
  usuario_empresa_id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  usuario_id uuid not null references auth.users(id) on delete restrict,
  rol varchar(40) not null check (rol in ('administrador_empresa', 'dueno', 'asesor', 'contador', 'colaborador', 'lector')),
  activo boolean not null default true,
  fecha_alta date not null default current_date,
  fecha_baja date,
  created_at timestamptz not null default now(),
  unique (empresa_id, usuario_id),
  check (fecha_baja is null or fecha_baja >= fecha_alta)
);

create or replace function app_private.has_empresa_access(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, core
as $$
  select target_empresa_id = app_private.current_empresa_id()
      or exists (
        select 1
          from core.usuario_empresa ue
         where ue.empresa_id = target_empresa_id
           and ue.usuario_id = auth.uid()
           and ue.activo
           and (ue.fecha_baja is null or ue.fecha_baja >= current_date)
      )
$$;

create table billing.empresa_suscripcion (
  empresa_suscripcion_id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  plan_id uuid not null references billing.plan(plan_id),
  vigente_desde date not null,
  vigente_hasta date,
  estado varchar(40) not null default 'activa' check (estado in ('activa', 'suspendida', 'cancelada', 'vencida')),
  created_at timestamptz not null default now(),
  unique (empresa_id, vigente_desde),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create table ref.unidad_medida (
  unidad_medida_id uuid primary key default gen_random_uuid(),
  empresa_id uuid references core.empresa(empresa_id),
  codigo varchar(40) not null,
  nombre varchar(120) not null,
  simbolo varchar(20) not null,
  dimension varchar(40) not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index unidad_global_codigo_uq on ref.unidad_medida (codigo) where empresa_id is null;
create unique index unidad_empresa_codigo_uq on ref.unidad_medida (empresa_id, codigo) where empresa_id is not null;

create table core.item (
  item_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  codigo varchar(80) not null,
  nombre varchar(180) not null,
  descripcion text,
  tipo_item varchar(40) not null check (tipo_item in ('materia_prima', 'insumo', 'mercaderia_reventa', 'producto_intermedio', 'producto_final', 'envase_embalaje', 'consumible', 'subproducto_recupero')),
  origen_item varchar(40) not null check (origen_item in ('comprado', 'fabricado', 'mixto', 'generado_subproducto')),
  vendible boolean not null default false,
  inventariable boolean not null default true,
  unidad_base_id uuid not null references ref.unidad_medida(unidad_medida_id),
  volumen_unitario_m3 numeric(24,10) check (volumen_unitario_m3 is null or volumen_unitario_m3 >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (empresa_id, item_id),
  unique (empresa_id, codigo),
  check (not vendible or tipo_item <> 'subproducto_recupero')
);
create index item_tipo_activo_idx on core.item (empresa_id, tipo_item, activo);

create table costing.receta_cabecera (
  receta_cabecera_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  item_id uuid not null,
  version integer not null check (version > 0),
  vigente_desde date not null,
  vigente_hasta date,
  estado varchar(40) not null default 'borrador' check (estado in ('borrador', 'activa', 'retirada')),
  cantidad_salida_base numeric(24,10) not null default 1 check (cantidad_salida_base > 0),
  observacion text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (empresa_id, receta_cabecera_id),
  unique (empresa_id, item_id, version),
  foreign key (empresa_id, item_id) references core.item(empresa_id, item_id),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create table costing.receta_item (
  receta_item_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  receta_cabecera_id uuid not null,
  item_componente_id uuid not null,
  linea integer not null check (linea > 0),
  cantidad_neta numeric(24,10) not null check (cantidad_neta > 0),
  merma_estandar numeric(18,10) not null default 0 check (merma_estandar >= 0 and merma_estandar < 1),
  unidad_id uuid not null references ref.unidad_medida(unidad_medida_id),
  factor_conversion_snapshot numeric(24,10) not null default 1 check (factor_conversion_snapshot > 0),
  observacion text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (empresa_id, receta_item_id),
  unique (empresa_id, receta_cabecera_id, linea),
  foreign key (empresa_id, receta_cabecera_id) references costing.receta_cabecera(empresa_id, receta_cabecera_id),
  foreign key (empresa_id, item_componente_id) references core.item(empresa_id, item_id)
);

create table costing.periodo (
  periodo_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  codigo varchar(80) not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  tipo varchar(40) not null check (tipo in ('historico', 'presupuestado')),
  estado varchar(40) not null default 'abierto' check (estado in ('abierto', 'cerrado', 'reabierto')),
  dias numeric(24,10) generated always as ((fecha_fin - fecha_inicio + 1)::numeric) stored,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (empresa_id, periodo_id),
  unique (empresa_id, codigo),
  check (fecha_fin >= fecha_inicio)
);

create table calc.version_motor (
  version_motor_id uuid primary key default gen_random_uuid(),
  version_semantica varchar(80) not null,
  version_esquema varchar(80) not null,
  fecha_publicacion date not null,
  hash_codigo char(64) not null,
  estado varchar(40) not null check (estado in ('borrador', 'activa', 'retirada')),
  notas text,
  unique (version_semantica, version_esquema)
);

create table calc.corrida_calculo (
  corrida_calculo_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  periodo_id uuid not null,
  corrida_origen_id uuid,
  codigo varchar(80) not null,
  estado varchar(40) not null default 'borrador' check (estado in ('borrador', 'validada', 'calculada', 'cerrada', 'sustituida', 'anulada')),
  es_oficial boolean not null default false,
  tipo_costo varchar(40) not null check (tipo_costo in ('estandar', 'actualizado_compras', 'real_integral')),
  cerrada_at timestamptz,
  cerrada_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (empresa_id, corrida_calculo_id),
  unique (empresa_id, codigo),
  foreign key (empresa_id, periodo_id) references costing.periodo(empresa_id, periodo_id),
  foreign key (empresa_id, corrida_origen_id) references calc.corrida_calculo(empresa_id, corrida_calculo_id),
  check (not es_oficial or estado = 'cerrada')
);
create unique index corrida_oficial_periodo_uq on calc.corrida_calculo (empresa_id, periodo_id) where es_oficial;

create table calc.corrida_version (
  corrida_version_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  corrida_calculo_id uuid not null,
  numero_version integer not null check (numero_version > 0),
  version_motor_id uuid not null references calc.version_motor(version_motor_id),
  estado varchar(40) not null default 'pendiente' check (estado in ('pendiente', 'calculando', 'calculada', 'fallida')),
  hash_entrada char(64) not null,
  hash_resultado char(64),
  calculada_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (empresa_id, corrida_version_id),
  unique (empresa_id, corrida_calculo_id, numero_version),
  foreign key (empresa_id, corrida_calculo_id) references calc.corrida_calculo(empresa_id, corrida_calculo_id)
);

create table calc.snapshot (
  snapshot_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  corrida_version_id uuid not null,
  schema_version varchar(80) not null,
  engine_version varchar(80) not null,
  hash_raiz char(64) not null,
  completo boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (empresa_id, snapshot_id),
  unique (empresa_id, corrida_version_id),
  foreign key (empresa_id, corrida_version_id) references calc.corrida_version(empresa_id, corrida_version_id)
);

create table calc.snapshot_seccion (
  snapshot_seccion_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  snapshot_id uuid not null,
  codigo_seccion varchar(80) not null,
  schema_version varchar(80) not null,
  contenido_json jsonb not null,
  hash_seccion char(64) not null,
  created_at timestamptz not null default now(),
  primary key (empresa_id, snapshot_seccion_id),
  unique (empresa_id, snapshot_id, codigo_seccion),
  foreign key (empresa_id, snapshot_id) references calc.snapshot(empresa_id, snapshot_id)
);

create table calc.catalogo_metrica (
  catalogo_metrica_id uuid primary key default gen_random_uuid(),
  codigo varchar(80) not null unique,
  nombre varchar(160) not null,
  unidad_tipo varchar(40) not null,
  version_motor_desde varchar(80) not null,
  activa boolean not null default true
);

create table calc.resultado_metrica (
  resultado_metrica_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  corrida_version_id uuid not null,
  item_id uuid,
  catalogo_metrica_id uuid not null references calc.catalogo_metrica(catalogo_metrica_id),
  valor_numerico numeric(24,8) not null,
  created_at timestamptz not null default now(),
  primary key (empresa_id, resultado_metrica_id),
  unique (empresa_id, corrida_version_id, item_id, catalogo_metrica_id),
  foreign key (empresa_id, corrida_version_id) references calc.corrida_version(empresa_id, corrida_version_id),
  foreign key (empresa_id, item_id) references core.item(empresa_id, item_id)
);

create table calc.catalogo_validacion (
  catalogo_validacion_id uuid primary key default gen_random_uuid(),
  codigo varchar(80) not null unique,
  nombre varchar(180) not null,
  fase varchar(40) not null,
  severidad varchar(40) not null,
  activa boolean not null default true
);

create table calc.validacion_resultado (
  validacion_resultado_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  corrida_version_id uuid not null,
  catalogo_validacion_id uuid not null references calc.catalogo_validacion(catalogo_validacion_id),
  entidad_tipo varchar(80),
  entidad_id uuid,
  estado varchar(40) not null default 'activa' check (estado in ('activa', 'resuelta', 'aceptada')),
  es_valida boolean not null,
  diferencia numeric(24,8),
  detalle_json jsonb not null default '{}'::jsonb,
  source_path text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (empresa_id, validacion_resultado_id),
  foreign key (empresa_id, corrida_version_id) references calc.corrida_version(empresa_id, corrida_version_id)
);

create table calc.partida_conciliacion (
  partida_conciliacion_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  corrida_version_id uuid not null,
  tipo varchar(40) not null check (tipo in ('recupero_no_asignado', 'excedente_recupero', 'impuesto_no_asignado', 'ajuste_favorable', 'ajuste_desfavorable')),
  monto_con_signo numeric(24,8) not null,
  origen_entity_type varchar(80),
  origen_id uuid,
  motivo_no_asignacion text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (empresa_id, partida_conciliacion_id),
  foreign key (empresa_id, corrida_version_id) references calc.corrida_version(empresa_id, corrida_version_id)
);

create table ops.job (
  job_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  tipo varchar(40) not null check (tipo in ('calculo', 'importacion', 'exportacion', 'purga', 'archivo_auditoria')),
  estado varchar(40) not null default 'pendiente' check (estado in ('pendiente', 'ejecutando', 'completado', 'fallido', 'cancelado')),
  referencia_tipo varchar(80),
  referencia_id uuid,
  idempotency_key varchar(160) not null,
  started_at timestamptz,
  finished_at timestamptz,
  attempts smallint not null default 0,
  error_code varchar(80),
  error_detail text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (empresa_id, job_id),
  unique (empresa_id, idempotency_key)
);
create index job_estado_idx on ops.job (empresa_id, estado);

create table audit.auditoria_evento (
  auditoria_evento_id uuid not null default gen_random_uuid(),
  empresa_id uuid not null references core.empresa(empresa_id),
  usuario_id uuid references auth.users(id),
  fecha_hora timestamptz not null default now(),
  tipo_evento varchar(80) not null,
  entidad_afectada varchar(100) not null,
  entidad_id uuid,
  estado_anterior jsonb,
  estado_nuevo jsonb,
  motivo text,
  corrida_anterior_id uuid,
  corrida_nueva_id uuid,
  sesion_id uuid,
  direccion_ip_hash char(64),
  user_agent varchar(500),
  datos_contexto jsonb not null default '{}'::jsonb,
  hash_evento char(64) not null,
  hash_evento_anterior char(64),
  primary key (empresa_id, auditoria_evento_id),
  unique (hash_evento),
  check (hash_evento_anterior is null or hash_evento <> hash_evento_anterior),
  foreign key (empresa_id, corrida_anterior_id) references calc.corrida_calculo(empresa_id, corrida_calculo_id),
  foreign key (empresa_id, corrida_nueva_id) references calc.corrida_calculo(empresa_id, corrida_calculo_id)
);
create index auditoria_empresa_fecha_idx on audit.auditoria_evento (empresa_id, fecha_hora desc);

create or replace function app_private.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro es append-only/inmutable: %.%', tg_table_schema, tg_table_name;
end;
$$;

create trigger snapshot_immutable before update or delete on calc.snapshot
for each row execute function app_private.reject_mutation();
create trigger snapshot_seccion_immutable before update or delete on calc.snapshot_seccion
for each row execute function app_private.reject_mutation();
create trigger resultado_metrica_immutable before update or delete on calc.resultado_metrica
for each row execute function app_private.reject_mutation();
create trigger partida_conciliacion_immutable before update or delete on calc.partida_conciliacion
for each row execute function app_private.reject_mutation();
create trigger auditoria_evento_append_only before update or delete on audit.auditoria_evento
for each row execute function app_private.reject_mutation();

create or replace function app_private.protect_closed_run()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'cerrada' then
    raise exception 'VAL-RUN-002: una corrida cerrada es inmutable';
  end if;
  return new;
end;
$$;
create trigger corrida_cerrada_immutable before update or delete on calc.corrida_calculo
for each row execute function app_private.protect_closed_run();

-- RLS: doble barrera. El API fija app.empresa_id por transacción; Supabase directo usa membresía auth.uid().
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'core.empresa', 'core.usuario_empresa', 'billing.empresa_suscripcion',
    'core.item', 'costing.receta_cabecera', 'costing.receta_item', 'costing.periodo',
    'calc.corrida_calculo', 'calc.corrida_version', 'calc.snapshot', 'calc.snapshot_seccion',
    'calc.resultado_metrica', 'calc.validacion_resultado', 'calc.partida_conciliacion',
    'ops.job', 'audit.auditoria_evento'
  ] loop
    execute format('alter table %s enable row level security', table_name);
    execute format(
      'create policy tenant_isolation on %s for all using (app_private.has_empresa_access(empresa_id)) with check (app_private.has_empresa_access(empresa_id))',
      table_name
    );
  end loop;
end $$;

alter table core.usuario_perfil enable row level security;
create policy own_profile on core.usuario_perfil for select using (usuario_id = auth.uid());
create policy own_profile_update on core.usuario_perfil for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

alter table ref.unidad_medida enable row level security;
create policy visible_units on ref.unidad_medida for select using (empresa_id is null or app_private.has_empresa_access(empresa_id));
create policy tenant_units_write on ref.unidad_medida for all using (app_private.has_empresa_access(empresa_id)) with check (empresa_id is not null and app_private.has_empresa_access(empresa_id));

alter table billing.plan enable row level security;
alter table billing.plan_limite enable row level security;
alter table ref.moneda enable row level security;
alter table calc.version_motor enable row level security;
alter table calc.catalogo_metrica enable row level security;
alter table calc.catalogo_validacion enable row level security;
create policy public_read_plan on billing.plan for select using (true);
create policy public_read_plan_limit on billing.plan_limite for select using (true);
create policy public_read_moneda on ref.moneda for select using (true);
create policy public_read_engine on calc.version_motor for select using (true);
create policy public_read_metric_catalog on calc.catalogo_metrica for select using (true);
create policy public_read_validation_catalog on calc.catalogo_validacion for select using (true);

insert into billing.plan (codigo, nombre) values ('free', 'Gratis'), ('pyme', 'PyME') on conflict do nothing;
insert into billing.plan_limite (plan_id, codigo, valor, unidad)
select plan_id, limits.codigo, limits.valor, limits.unidad
from billing.plan
cross join (values
  ('sku_vendibles', 5::numeric, 'items'),
  ('productos_intermedios', 10::numeric, 'items'),
  ('archivo_nativo_mb', 50::numeric, 'megabytes')
) as limits(codigo, valor, unidad)
where billing.plan.codigo = 'free'
on conflict do nothing;

insert into ref.moneda (codigo, nombre, decimales) values ('ARS', 'Peso argentino', 2), ('USD', 'Dólar estadounidense', 2) on conflict do nothing;
insert into calc.version_motor (version_semantica, version_esquema, fecha_publicacion, hash_codigo, estado, notas)
values ('0.1.0', '2026-07-27.beta1', '2026-07-27', repeat('0', 64), 'activa', 'Primer corte vertical; reemplazar hash_codigo durante CI/CD.')
on conflict do nothing;

insert into calc.catalogo_metrica (codigo, nombre, unidad_tipo, version_motor_desde) values
  ('resultado.ventas_netas', 'Ventas netas', 'moneda', '0.1.0'),
  ('resultado.costo_directo', 'Costo directo', 'moneda', '0.1.0'),
  ('resultado.costo_variable_total', 'Costo variable total', 'moneda', '0.1.0'),
  ('resultado.margen_bruto', 'Margen bruto', 'moneda', '0.1.0'),
  ('resultado.contribucion_marginal', 'Contribución marginal', 'moneda', '0.1.0'),
  ('resultado.resultado_operativo', 'Resultado operativo', 'moneda', '0.1.0')
on conflict do nothing;

insert into calc.catalogo_validacion (codigo, nombre, fase, severidad) values
  ('VAL-DAT-001', 'Campo obligatorio por nivel de resultado', 'captura', 'error_bloqueante'),
  ('VAL-DAT-002', 'Número finito y formato decimal', 'captura', 'error_bloqueante'),
  ('VAL-UNT-001', 'Unidad base obligatoria', 'captura', 'error_bloqueante'),
  ('VAL-BOM-001', 'BOM sin ciclos', 'pre_calculo', 'error_bloqueante'),
  ('VAL-BOM-002', 'Autorreferencia prohibida', 'captura', 'error_bloqueante'),
  ('VAL-DRV-002', 'Base no negativa y suma positiva', 'pre_calculo', 'error_bloqueante'),
  ('VAL-REC-001', 'Tolerancia interna de 0,01', 'post_calculo', 'error_bloqueante'),
  ('VAL-REC-002', 'No redondear antes de conciliar', 'calculo', 'error_bloqueante')
on conflict do nothing;
