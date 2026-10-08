# Stripe Connect para inscripciones

Objetivo: cargos directos en cuentas Standard del organizador, Checkout con tarjeta en MXN, sin comisión de plataforma. El SaaS se cobra fuera de esta integración.

Se conserva `categories` como entidad de categorías y `teams` como participantes deportivos (individuales o equipos). Nuevas entidades: cuentas por tenant, inscripciones, intentos de pago, eventos y notificaciones de confirmación. Las inscripciones existentes conservan su comportamiento; las nuevas usan precios y política explícita de categoría.

El importe se congela al registrar. Las categorías gratuitas confirman sin Stripe; los pagos externos requieren autorización explícita y confirmación por un colaborador. Los estados financieros no cambian automáticamente la participación al reembolsar.

Cada categoría serializa sus reservas con bloqueo de fila. Una reserva pendiente ocupa cupo hasta comprobar que Stripe ya no puede cobrarla. El vencimiento local no basta para liberar una sesión: el worker consulta Stripe y procesa el estado final. Ante error de red se conserva el cupo. Checkout reserva 31 minutos al preparar el intento: el mínimo de 30 minutos de Stripe más un minuto de margen de creación. Una clave estable por intento permite recuperar sesiones tras caída del proceso. Las confirmaciones se realizan por webhook firmado o conciliación autenticada de Stripe, nunca por la página de retorno.

Los webhooks validan firma sobre bytes originales y cuenta conectada, aplican efectos idempotentes bajo bloqueo de fila y registran el evento solamente tras completarlos y comprueban importe/moneda/sesión. Los cambios de categoría y aprobación existentes deben respetar las nuevas reservas.

Verificación: migración sobre base aislada, último cupo concurrente, checkout duplicado, reenvío y desorden de eventos, caída antes de persistir sesión, expiración, reembolso parcial/completo, pérdida de habilitación y aislamiento entre tenants; build backend y typecheck/build frontend.

Configuración externa necesaria: claves Stripe, client ID para desvincular cuentas Standard, webhook Connect y SMTP. No se crean cobros reales durante las pruebas.
