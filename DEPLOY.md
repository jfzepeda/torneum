**Estado: el código está maduro, pero la infraestructura de producción no existe todavía.** Calculo unos 2–4 días de trabajo enfocado para un lanzamiento controlado, según qué tanto quieras activar pagos y Google.

## Lo que ya está

- **Backend (Fastify + Postgres):** compila, con 9 migraciones y multi-tenant.
- **Seguridad básica:**
  - cookies `httpOnly`, y `secure` cuando `NODE_ENV=production`
  - helmet, CORS y rate-limit por ruta
  - límites y validación de imágenes
- **Frontend (Next.js):** ya usa `output: "standalone"` y typecheck limpio.
- **Datos demo:** el torneo Padelón ya está hidratado en local.
- **Secretos:** ningún `.env` ni `.admin-credentials` está trackeado en git.

## Lo que falta

**Bloqueantes**

1. **No hay configuración de despliegue.** No encontré Dockerfile, CI, ni config de Railway, Fly, Render o Vercel. Hay que decidir dónde corre cada pieza (por ejemplo frontend en Vercel, backend y Postgres en Railway o Fly) y escribir esa configuración.
2. **Tests de integración sin verificar.** `pnpm test` pasó 20 de 53 y **saltó 33**. Entre ellos están los de tenancy (aislamiento entre organizaciones), que son los más críticos. Casi seguro se saltan por no tener `DATABASE_URL` de prueba. Hay que correrlos contra una BD real antes de lanzar.
3. **Cookies entre dominios.** Las cookies usan `sameSite: "lax"`. Si el frontend y el API quedan en dominios distintos, el login no va a funcionar. La solución es poner ambos bajo el mismo dominio registrable (`app.x.com` y `api.x.com`) y revisar `FRONTEND_URL` y CORS.
4. **Proxy detrás de la plataforma.** No vi `trustProxy` en Fastify. Detrás de un proxy, el rate-limit vería una sola IP para todos, y el login limitado a 10 por minuto bloquearía usuarios legítimos.
5. **Variables de entorno de producción:**
   - `DATABASE_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`
   - `OAUTH_ENCRYPTION_KEY`, `ADMIN_PASSWORD`
   - `SMTP_URL`, `MAIL_FROM`, `OUTBOX_ENABLED`
   - Si el frontend no recibe `NEXT_PUBLIC_API_URL` al hacer el build, apunta a `127.0.0.1:4000`.

**Importantes, pero no frenan un lanzamiento suave**

- **Pagos (Stripe Connect):** hay que configurar llaves live, el webhook y el `CLIENT_ID`. Si no los necesitas el día 1, puedes lanzar sin cobros.
- **Google Forms/Sheets:** requiere un OAuth redirect URI de producción y que la app de Google esté verificada.
- **Imágenes en Postgres:** funciona, pero hay que vigilar el tamaño de la BD y hacer backups.
- **Dependencias en `latest`:** fastify, next, react y otras. Los lockfiles protegen, pero conviene fijar versiones.
- **Migraciones y backups:** definir cuándo corre `pnpm migrate` (en el deploy) y quién respalda la BD.
- **Observabilidad:** healthcheck, logs y monitoreo de errores.
- **Dominio y TLS.**

## Plan sugerido

1. Elegir plataforma y dominio.
2. Dockerfile o config para backend y frontend, más Postgres administrado.
3. Correr los 33 tests saltados contra una BD de prueba.
4. Cargar las variables, aplicar `trustProxy` y verificar las cookies entre subdominios.
5. Hacer deploy a staging con Padelón y revisar el flujo de inscripción de punta a punta, con el Playwright que ya tienen.
6. Activar Stripe y Google después, en una segunda fase.

¿Dónde quieres desplegar? Con eso te preparo la configuración. Si prefieres, empiezo por correr los tests de integración con una BD local para ver si hay algo roto antes de tocar infraestructura.
