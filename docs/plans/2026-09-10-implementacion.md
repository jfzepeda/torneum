# Implementación Torneum
Diseño autorizado: 2026-09-10-producto.md. Autonomía explícita del propietario.

## Decisiones
- Next.js App Router / React / Tailwind / shadcn, API Fastify modular. Fastify directo reduce capas frente a Nest, que era recomendación y no requisito.
- PostgreSQL con pg, migrador SQL transaccional, colas en PostgreSQL con bloqueo de filas. Sin ORM.
- Cookies HttpOnly, contraseñas scrypt, permisos por rol en backend, tokens de participante de un solo uso y caducidad.
- Correo transaccional SMTP; Gmail OAuth y ChatKit se habilitan con configuración real. Sin credenciales no se afirma envío ni conectividad.
- Docker Compose para despliegue independiente, no se contratan servicios ni se envían mensajes durante desarrollo.
- Diseño: organizador entre canchas, pendientes accionables, marcadores y agenda. Blanco tiza, grafito de malla, verde de cancha, verde pelota, ámbar de aviso. Acento verde; tablas frente a tarjetas decorativas, programación visual frente a gráficos genéricos, progreso por categoría frente a métricas sin contexto.

## Entregables y comprobación
1. Fundaciones, SQL y sesiones.
2. Inscripción, gestión y aprobaciones.
3. Motor de pádel, sorteo, clasificación y eliminación.
4. Planificación, swap, desprogramar, deshacer.
5. Dashboard, portal y estadísticas.
6. Patrocinadores, propuestas, cola y adaptadores.
7. Integraciones conversacionales seguras.
8. Pruebas unitarias, integración con PostgreSQL, compilación y recorrido en navegador.

La aceptación del piloto, cumplimiento jurídico y recuperación en infraestructura de producción requieren validación operativa externa; se registran por separado del código entregado.
