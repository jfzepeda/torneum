# Google Forms / Sheets e inscripciones flexibles

Implementación aprobada: Sheets público independiente de OAuth; OAuth opcional para lectura privada y generación de preguntas. Respuestas en bandeja antes de aceptar; coincidencias >=80% revisadas por admin, nunca fusionadas automáticamente. Correo de contacto obligatorio y único por torneo. Extras capturan preferencias, no importes ni inventario. Correcciones externas no sobrescriben inscripciones.

## Contratos

Campos por torneo con IDs estables, ámbito equipo/participante y tipos texto, número, fecha, selección simple/múltiple y booleano. Mapeos por columna identificada o questionId. Identidad Forms por formId/responseId; Sheets por clave seleccionada o huella de contenido. Sin clave estable no se pueden reconocer ediciones ni distinguir filas idénticas. Decisiones y vínculos sobreviven a reintentos.

## Implementación

1. Modelo y validación compartidos; proyección pública solo de nombres.
2. Bandeja y resolución versionada, alta transaccional, verificación en outbox.
3. Descarga CSV segura, mapper, sincronización manual/programada.
4. OAuth aislado de Gmail, creación/actualización/publicación explícitas.

## Verificación

`pnpm -C backend test`, `pnpm -C backend build`, `pnpm -C frontend typecheck`, `pnpm -C frontend build`, `pnpm -C frontend test:e2e`.

Pruebas de DB requieren DATABASE_URL=TEST_DATABASE_URL apuntando a una base dedicada. Probar idempotencia, concurrencia, aislamiento, parsing, SSRF, mapeos ambiguos, colisiones, pagos, OAuth y privacidad. No modificar datos reales ni cambios locales ajenos.

## Uso y despliegue

1. Ejecutar `pnpm -C backend migrate` en el entorno que se quiera actualizar y reiniciar backend/frontend.
2. En **Importar y revisar → Campos de inscripción**, definir contactos por equipo/participante y extras. Los IDs son estables; desactivar campos antiguos, no eliminarlos.
3. En **Google Forms / Sheets**, pegar enlace público (HTTPS de docs.google.com), validar, mapear columnas, elegir categoría y opcionalmente columna de identidad; guardar y sincronizar.
4. En **Por revisar**, aceptar válidas en lote o resolver cada amarillo como original, corrección, descarte o inscripción distinta. El correo de contacto sigue siendo único por torneo.
5. Para OAuth configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_FORMS_REDIRECT_URI y OAUTH_ENCRYPTION_KEY (base64 de 32 bytes). Habilitar Forms API y registrar el redirect de Forms, conservando el de Gmail. Conectar cuenta desde el panel. Scopes: forms.body y forms.responses.readonly.
6. Crear borrador por categoría; revisar preguntas antes de publicarlo. Torneum asigna como capitán al primer participante en los formularios generados.

La sincronización automática se ejecuta desde el backend cada cinco minutos (GOOGLE_FORMS_SYNC_INTERVAL_MINUTES). Se puede pausar por fuente. Nunca publica hojas privadas. Los errores y resultados se muestran en cada fuente.

La identidad CSV sin clave estable es una huella de todas las columnas identificadas. Reordenar filas o encabezados únicos no cambia la identidad. Filas idénticas se colapsan; ediciones son nuevas candidatas y no se pueden inferir como actualizaciones seguras. Para reconocer ediciones, elegir una columna con IDs únicos no vacíos.

La similitud combina participantes 70%, equipo 10%, correo 15%, teléfono 5%, renormalizando señales presentes; requiere participantes y otra señal para el umbral de 80%. Email o conjunto exacto de participantes siempre solicita revisión. Nombres se comparan por distancia de edición y correspondencia uno a uno; no es una probabilidad ni decide fusiones.

Las notificaciones se encolan transaccionalmente y usan Message-ID estable. SMTP no garantiza exactamente una entrega si un proceso muere después de enviar y antes de confirmar el envío; los reintentos de aceptación/sincronización no crean más trabajos.

Correcciones externas permiten elegir nombre, teléfono, participantes y extras. Cambiar correos verificados o categoría/pagos queda fuera de esa operación para preservar los flujos existentes. Google no confirma pagos ni verifica automáticamente contactos.

Una creación de Forms cuyo resultado remoto sea incierto no se repite automáticamente: revisar Google y conectar el formulario existente. Si se guardó el formId y falló agregar preguntas, se puede reintentar el mismo trabajo sin volver a crear el formulario.

## Verificación de esta entrega

Los escenarios de navegador están en `frontend/tests/google.spec.ts` y simulan la API; ejecutar `pnpm -C frontend test:e2e google.spec.ts` con el frontend en el puerto 3000. Las pruebas backend de Google usan una base dedicada y Google simulado; no requieren credenciales ni publican formularios reales.

El generador OpenAPI instalado requiere la API de TypeScript 5; con TypeScript 7 se puede regenerar de forma aislada sin cambiar el compilador del proyecto:

```
pnpm -C backend openapi
pnpm --package=openapi-typescript@7.13.0 --package=typescript@5.9.3 dlx openapi-typescript backend/openapi.json -o frontend/src/lib/api-schema.d.ts
```
