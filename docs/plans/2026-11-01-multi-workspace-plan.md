# Plan y verificación de múltiples workspaces

Alcance aprobado el 2026-11-01. Copias independientes confirmadas.

1. Modelo y autorización: migración incremental, asignaciones a torneos,
   identificación explícita en peticiones y validación de recursos.
   Verificar con dos torneos del mismo tenant, otro tenant y roles distintos.
2. API: separar creación y archivo, estado local y global, identidad comercial
   reutilizable y copia transaccional con relaciones remapeadas.
   Verificar conflictos, idempotencia, rollback y conservación del origen.
3. Panel: selector por URL, creación, configuración global, ajustes locales,
   asignaciones y formulario de reutilización. Reutilizar componentes existentes.
   Verificar dos pestañas, recarga, historial y respuestas atrasadas.
4. Compatibilidad: contexto en portal, inscripciones, acceso de capitán, pagos,
   Google y asistentes. Verificar rutas directas y permisos por recurso.
5. Validación: base PostgreSQL temporal, suite completa, typecheck, compilaciones
   y pruebas de navegador. Registrar resultados reales y límites.

No se añaden dependencias. Las skills auxiliares de implementación incremental,
TDD y carga de contexto referidas por spec-driven-development no están instaladas;
se siguen directamente tareas acotadas con comprobaciones de dominio e integración.
