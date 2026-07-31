# Costeo organizacional — beta inicial

Primer corte ejecutable del infoproducto de costeo para PyMEs. Implementa el motor compartido, conciliaciones, casos patrón, contrato API, calculadora gratuita local y la base de persistencia para corridas pagas.

## Qué funciona hoy

- Descomposición de bruto/neto/IVA (`FND-004`) y tratamiento económico del IVA (`FND-005`).
- Compras promedio y fallback de precio (`MAT-001`, `MAT-003`, `MAT-004`).
- BOM con merma, materiales, MOD y productos intermedios (`MAT-005` a `MAT-007`, `LAB-002/003`, `INT-001/002/004`).
- Ítems comprados, fabricados y mixtos.
- Costos directos e indirectos, drivers y jerarquía residual (`ASG-001/002/003/006`).
- Vistas por trazabilidad y comportamiento (`RES-001` a `RES-007`) con conciliaciones `REC-001/002/004/005`.
- Validaciones de decimales, límites gratuitos, BOM, fuentes de costo, drivers y tolerancia.
- Archivo local ZIP gratuito con versión y SHA-256; al abrirlo se valida y recalcula.
- API Fastify `/v1/calculations/free`, documentación `/docs` y health check `/health`.
- Migration inicial de Supabase con RLS, FKs tenant-safe, snapshots y auditoría append-only.
- Worker de Graphile para corridas pagas y persistencia de métricas normalizadas.

## Requisitos

- Node.js 24 LTS
- pnpm 11.9
- PostgreSQL 17 / Supabase CLI para la capa persistente

## Desarrollo

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

Web: `http://localhost:3000`  
API: `http://localhost:4000`  
OpenAPI UI: `http://localhost:4000/docs`

La calculadora web gratuita no necesita API ni base para calcular. Para el worker se requiere `DATABASE_URL`; copiar `.env.example` a `.env` y completar secretos localmente.

## Estructura

```text
apps/web        Next.js + Web Worker gratuito
apps/api        Fastify REST/OpenAPI
apps/worker     Graphile Worker
packages/domain     motor puro determinista
packages/contracts  DTO y validación Zod
packages/database   transacciones tenant y repositorio de resultados
supabase/migrations esquema PostgreSQL/RLS
deploy              contenedores y configuración Fly.io GRU
docs/architecture   decisiones y mapeos del diccionario
```

## Verificación y despliegue

La CI ejecuta tipos, ocho pruebas del motor y build de producción. Para desplegar, primero crear los tres proyectos Fly, reemplazar los nombres placeholder en `deploy/fly/*.toml`, cargar secretos y aplicar la migration en un proyecto Supabase de São Paulo. No hay despliegue automático a producción en este corte.

La decisión completa está en [ADR-001](docs/architecture/ADR-001-beta-architecture.md).
