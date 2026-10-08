# Stripe Connect

Torneum utiliza cuentas Standard del organizador, cargos directos, Checkout y MXN. No añade `application_fee_amount` ni realiza transferencias. El organizador administra sus ingresos y reembolsos en Stripe Dashboard. El cobro del SaaS sigue siendo externo.

## Configuración

1. Instala dependencias del backend con `pnpm install --frozen-lockfile` y ejecuta `pnpm migrate` con la base de datos destino configurada.
2. Define `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID` y `STRIPE_WEBHOOK_SECRET` en el backend. Usa claves de prueba antes de habilitar producción. El client ID de Connect se utiliza para desconectar cuentas Standard.
3. Configura una **destinación Connect para eventos de cuentas conectadas**, formato snapshot y versión `2026-09-30.endive`, apuntando a `https://API/v1/webhooks/stripe`. Suscribe `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `account.updated` y `account.application.deauthorized`.
4. Define `FRONTEND_URL` con el origen real. Configura SMTP (`SMTP_URL`, `MAIL_FROM`) para verificación y confirmación por correo.
5. En Configuración del torneo, conecta Stripe y completa el onboarding alojado por Stripe. Al regresar, actualiza el estado. Para un enlace vencido, pulsa nuevamente “Completar verificación”.
6. Define forma de pago, importe, participantes por inscripción, fechas y políticas del organizador en cada categoría. Las categorías existentes se migran como gratuitas; cambiar su precio afecta solamente registros nuevos.

El backend debe ejecutar `src/server.ts` o su compilado: allí corre el worker de pagos cada 15 segundos, independientemente del outbox de patrocinadores. Puede ejecutarse en más de una instancia; las transiciones y notificaciones se protegen con bloqueos de PostgreSQL. No se confirma una inscripción desde la URL de retorno.

## Flujo

El participante registra sus datos y verifica el correo. En “Mi pareja” puede abrir Checkout y consultar el estado. Se conserva el nombre histórico de esa sección, aunque la categoría admite un participante o un equipo. La autorización deportiva (`pending`/`approved`) permanece separada de la confirmación del pago.

Una reserva inicial dura 30 minutos. Al abrir Checkout se fija una ventana de 31 minutos (30 minutos mínimos de Stripe más un minuto de margen de creación). La UI muestra su vencimiento exacto. El intento y sus parámetros quedan persistidos antes de contactar a Stripe; reintentar utiliza la misma clave de idempotencia. Una tarjeta rechazada puede reintentarse en esa sesión; no se libera el cupo mientras la sesión permita cobrar.

El vencimiento local no libera automáticamente una sesión existente: primero se verifica su estado en Stripe. Si hubo una caída después de crear la sesión pero antes de persistir su ID, el worker la recupera por metadata. Tras vencer y esperar cinco minutos, una creación sin sesión recuperable se libera. Si Stripe no responde, el cupo se conserva y el error queda en los logs; un registro problemático no detiene los demás.

Los pagos externos requieren confirmación explícita del organizador y una referencia auditada antes de vencer la reserva. Las inscripciones gratuitas no crean intentos Stripe. Los reembolsos parciales y completos actualizan el estado financiero sin retirar al participante. El cambio de categoría de una inscripción nueva queda bloqueado para conservar precio, reserva y pago asociados.

No se permite desconectar desde Torneum mientras haya pagos pendientes. Si el organizador revoca acceso directamente en Stripe, se deshabilitan nuevos cobros; las reservas sin conciliación permanecen retenidas hasta resolver el acceso/estado con el organizador. Volver a conectar inicia onboarding de una cuenta Standard nueva, conservando los registros históricos de pagos.

## Verificación local

Usa una base dedicada, nunca producción:

```sh
DATABASE_URL=postgresql://.../torneum_stripe_test pnpm migrate
DATABASE_URL=postgresql://.../torneum_stripe_test TEST_DATABASE_URL=postgresql://.../torneum_stripe_test NODE_ENV=test DEV_MAILBOX=true pnpm test
pnpm build
```

Las pruebas simulan Stripe y usan PostgreSQL real para cupos, transacciones y concurrencia. Verifican firma del webhook, duplicados, aislamiento, recuperación, reembolsos y capacidad de cobro. Antes de activar producción, completa además onboarding, Checkout con tarjeta de prueba y devolución desde Stripe Dashboard en tu cuenta sandbox; estas comprobaciones requieren tus credenciales.

Referencias oficiales: [Direct Charges](https://docs.stripe.com/connect/direct-charges), [Standard onboarding](https://docs.stripe.com/connect/standard-accounts), [Webhooks Connect](https://docs.stripe.com/connect/webhooks), [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create).
