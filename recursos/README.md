# Recursos de negocio — Sistema de Costeo MVP

Esta carpeta reúne los documentos fuente utilizados para definir el MVP del infoproducto de costeo organizacional. Puede versionarse junto con el código para conservar la trazabilidad entre los requerimientos, el modelo de datos, las validaciones y el motor de cálculo.

## Documentos incluidos

- `Especificacion_Contextual_Sistema_Costeo_MVP.pdf`: alcance, contexto de negocio y criterios funcionales.
- `Flujos_Usuario_Roles_Sistema_Costeo_MVP.pdf`: actores, permisos y recorridos del sistema.
- `Modelo_Entidad_Relacion_Sistema_Costeo_MVP.pdf`: entidades y relaciones persistentes.
- `Diccionario_Datos_Sistema_Costeo_MVP.pdf`: definición y reconciliación de campos.
- `Matriz_Completa_Validaciones_Sistema_Costeo_MVP.pdf`: reglas de consistencia y validaciones.
- `Catalogo_Formal_Formulas_Sistema_Costeo_MVP.pdf`: fórmulas y reglas del motor de costeo.

## Relación con el código

- `packages/domain/`: reglas de cálculo y pruebas del dominio.
- `packages/contracts/`: contratos y esquemas compartidos.
- `packages/database/` y `supabase/`: persistencia y migraciones.
- `apps/web/`: aplicación web.
- `apps/api/` y `apps/worker/`: API y procesamiento asíncrono.
- `docs/` y `deploy/`: decisiones de arquitectura y despliegue.

No se incluyen dependencias instaladas, artefactos de compilación, procesos locales ni secretos. Estos ya están excluidos por `.gitignore`.
