# Especificación: múltiples torneos por tenant

Estado: alcance aprobado; implementación en curso.
Fecha: 2026-11-01.

## Objetivo

Una cuenta administradora puede crear y gestionar varios torneos simultáneos
dentro de su organización. Cada torneo es un workspace. El sidebar permite
cambiar rápidamente entre ellos y mantiene una sección GESTIÓN global al tenant.
Patrocinadores, paquetes, categorías y colaboradores pueden reutilizarse entre
torneos del mismo tenant.

## Decisiones aprobadas

1. Tenant equivale a la organización/club existente; no se crean nuevas
   organizaciones ni cuentas al crear un torneo.
2. La configuración compartida comprende marca, conexiones del club y cuenta de
   cobro. Nombre, fechas, sede, inscripción y reglas pertenecen a cada torneo.
3. Confirmado por el usuario: portabilidad significa reutilizar personas y patrocinadores, y copiar la
   configuración de paquetes y categorías de forma independiente. Los cambios
   posteriores en reglas o precios no se propagan automáticamente.
4. Los administradores acceden a todos los torneos del tenant. Los demás
   colaboradores conservan una sola cuenta y se asignan a uno o varios torneos,
   con su rol existente. Esta versión no introduce roles diferentes por torneo.
5. Las asignaciones existentes se conservan al migrar. Los nuevos torneos
   requieren asignar colaboradores explícitamente.

## Situación comprobada en el repositorio

- `backend/migrations/001_core.sql`: el índice `one_active_tournament` impide
  varios torneos no archivados por organización.
- `backend/src/app.ts`: `/v1/tournaments/new` exige archivar el torneo actual y
  terminar sus partidos. El formulario de creación inicial no satisface ese
  contrato; el flujo de creación debe servir también a un tenant vacío.
- `backend/src/state.ts`: el estado elige implícitamente el torneo no archivado
  más reciente. La función `active()` de `app.ts` también presupone uno solo.
- `frontend/src/components/dashboard.tsx`: el selector es un elemento visual sin
  interacción. La navegación conserva la vista, pero no identifica el torneo.
- GESTIÓN mezcla alcances: usuarios, marca, auditoría y conexiones son globales;
  patrocinadores, paquetes, mensajes comerciales y solicitudes dependen del torneo.
- Configuración mezcla marca y cobros del tenant con información del torneo.
- Portal, inscripción y navegación pública usan actualmente el slug del club sin
  identificar un torneo concreto.

## Comportamiento esperado

### Crear y cambiar de torneo

- Selector accesible en el sidebar, con nombre del torneo actual y lista de
  torneos autorizados. Incluye «Crear torneo» para administradores.
- Crear un torneo no archiva ni modifica otro. Al crearlo se abre su workspace.
- El contexto de torneo queda en la URL. Dos pestañas pueden gestionar torneos
  distintos sin cambiarse el contexto mutuamente.
- Recargar, navegar hacia atrás o compartir una URL conserva el torneo.
- Al cambiar se descartan respuestas atrasadas y se reinician formularios y
  selecciones locales del torneo anterior. No se permite enviar operaciones
  mientras los datos visibles no correspondan al contexto seleccionado.
- Los datos globales siguen disponibles aunque no exista ningún torneo activo.
- Archivar es una acción separada sobre un torneo identificado. Conserva sus
  datos y las restricciones actuales relativas a partidos pendientes.

### Sidebar y configuración

| Sección | Contenido | Alcance |
| --- | --- | --- |
| TORNEO | Inicio, inscripciones, importaciones, categorías, equipos, grupos, calendario, resultados, cuadro, estadísticas, ajustes del torneo | Torneo seleccionado |
| GESTIÓN | Solicitudes, patrocinadores y paquetes, colaboradores, configuración del club, torneos archivados | Tenant |

Las solicitudes globales muestran el torneo de origen y permiten filtrarlo. Cada
acción opera sobre esa solicitud y su torneo, independientemente del selector.
Patrocinadores y colaboradores muestran sus asignaciones a torneos. Las pantallas
globales no cambian su conjunto de datos al cambiar el workspace; un filtro de
torneo explícito sí puede acotarlo. La visibilidad sigue respetando los permisos.

Los ajustes del torneo incluyen nombre, fechas, sede, apertura y aprobación de
inscripciones, formulario y destacados. Los valores y reglas de categorías
permanecen locales. Credenciales y cuenta de cobro siguen siendo del tenant;
fuentes de importación y formularios conectados pertenecen al torneo que los usa.

### Portabilidad

- Patrocinadores: identidad/contacto/logo reutilizable en el tenant; paquete,
  estado de negociación y seguimiento propios de cada asignación a torneo.
  Asignar a otro torneo no implica confirmar un patrocinio ya ganado en el origen.
  Conservar las exclusiones existentes y no reactivar contactos excluidos al copiar.
- Paquetes: copiar nombre, importe, beneficios, ubicaciones, prioridad y tamaño
  de logo. La copia es editable sin afectar al origen.
- Categorías: copiar nombre, cupo, formato, reglas, tiempos y configuración de
  cobro. Presentar las ventanas de inscripción para revisión al cambiar fechas.
  La nueva categoría empieza sin sorteo, parejas, grupos, partidos ni resultados.
- Colaboradores: asignar cuentas existentes a uno o varios torneos, sin duplicar
  usuarios, contraseñas o sesiones. Retirar una asignación revoca solo ese acceso;
  desactivar una cuenta sigue siendo una acción global.
- Flujo «Reutilizar de otro torneo»: elegir origen del mismo tenant, destino y
  elementos; revisar selección y aplicar. También acepta origen archivado.
- Remapear los paquetes de los patrocinadores a sus equivalentes en el destino.
  Si falta un paquete, incluir su copia explícitamente en el resumen.
- No sobrescribir elementos del destino silenciosamente. Informar conflictos de
  categorías por nombre y permitir omitirlos. Repetir una asignación existente no
  crea duplicados; los reintentos de una misma operación son idempotentes.
- Mantener la regla comercial existente de un máximo de dos patrocinadores confirmados de máxima
  prioridad por torneo. La reutilización no copia mensajes ni dispara envíos.
- Aplicar cada selección validada en una transacción y registrar su auditoría.

### Aislamiento, acceso y compatibilidad

- Validar organización, torneo y permisos en el servidor para lecturas y cambios,
  incluyendo operaciones que reciben solo un ID de recurso.
- No aceptar recursos de otro torneo en una operación local, ni portabilidad
  entre tenants. La selección del navegador nunca concede permisos.
- Revisar operaciones masivas de inscripción, Google, pagos, mensajes y asistentes
  para que no actúen sobre un torneo implícito ni evadan las asignaciones.
- Cada torneo debe tener enlaces públicos e inscripción con contexto explícito,
  que persiste al navegar, verificar un correo y regresar de un pago.
- Los enlaces antiguos del club se conservan: con un torneo muestran ese torneo;
  con varios ofrecen selección explícita, evitando elegir silenciosamente el último.
- Un capitán puede participar en varios torneos con el mismo correo; los accesos
  y enlaces de verificación resuelven la pareja y el torneo correctos.
- Migración incremental que conserva IDs e historial existentes. No fusionar
  automáticamente patrocinadores por coincidencia de nombre.

## Stack y estructura

Versiones instaladas observadas: Next.js 16.3.4, React 19.3.0 y Fastify 5.12.5.
TypeScript, PostgreSQL mediante `pg`, validación Zod y pnpm 11.5.2.

- `backend/src/`: API, autorización y lógica de dominio.
- `backend/migrations/`: migraciones SQL incrementales.
- `backend/tests/`: pruebas con `node:test` y peticiones Fastify inyectadas.
- `frontend/src/components/`: panel, operaciones y portal público.
- `frontend/src/lib/`: cliente API, tipos y contrato OpenAPI generado.
- `frontend/tests/`: pruebas de navegador Playwright.
- `docs/plans/`: especificación y posterior plan técnico.

## Comandos

Ejecutar desde la raíz del repositorio:

```sh
pnpm --dir backend dev
pnpm --dir frontend dev
pnpm --dir backend build
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir backend test
pnpm --dir backend openapi
pnpm --dir frontend generate:api
pnpm --dir frontend test:e2e
```

Integración requiere `TEST_DATABASE_URL` configurada con una base dedicada:

```sh
DATABASE_URL="$TEST_DATABASE_URL" pnpm --dir backend migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm --dir backend test
```

Verificar que la variable no esté vacía antes de ejecutar esos comandos. Las
pruebas que se omitan por falta de base de datos no cuentan como verificación.
Playwright requiere frontend y backend de prueba levantados. Ningún paquete
declara actualmente un script de lint; usar compilación y comprobación de tipos,
sin añadir herramientas de lint como parte de esta funcionalidad.

## Estilo de código

Respetar el estilo del archivo editado, validación Zod, consultas parametrizadas,
`ensure`, transacciones y auditoría existentes. Ejemplo del repositorio:

```ts
const team = (
  await db.query(
    "SELECT * FROM teams WHERE id=$1 AND organization_id=$2",
    [a.team_id, a.organization_id],
  )
).rows[0];
```

Usar componentes de interfaz existentes y mensajes en español. Leer las guías
locales de Next.js indicadas por `frontend/AGENTS.md` antes de editar frontend.

## Estrategia de pruebas y criterios de aceptación

1. Crear dos torneos activos en un tenant, incluido el primer torneo de un tenant
   vacío. Comprobar que ninguno se archiva o modifica por crear otro.
2. Alternar workspaces, recargar y operar en dos pestañas. Comprobar que categorías,
   canchas, ajustes e inscripciones se escriben en el torneo indicado.
3. Forzar respuestas fuera de orden al alternar: no mostrar ni guardar datos del
   workspace anterior bajo el nombre del nuevo.
4. Confirmar que GESTIÓN mantiene datos globales y funciona sin torneos activos;
   los filtros y acciones conservan el contexto de cada recurso.
5. Reutilizar cada tipo de recurso, sus relaciones y una selección combinada.
   Verificar independencia, conflictos, reintentos y ausencia de datos deportivos
   o envíos heredados. Comprobar rollback si falla una selección.
6. Probar dos tenants y varios colaboradores: accesos directos, escrituras por ID,
   exportaciones, asistentes y revocación de asignaciones respetan los permisos.
7. Migrar datos con historial y patrocinadores existentes sin pérdida de relaciones.
8. Probar portal, inscripción, verificación de capitán y retorno de cobro para dos
   torneos, incluidos participantes con el mismo correo.
9. Ejecutar la suite existente, pruebas nuevas de integración y Playwright,
   compilación y typecheck. Documentar cualquier bloqueo real de infraestructura.

## Límites

- Siempre: mantener aislamiento entre tenants, verificar autorización en servidor,
  conservar datos existentes y probar los flujos modificados.
- Consultar antes: sincronización automática de reglas entre torneos, roles
  distintos por torneo, fusión de registros históricos, dependencias nuevas o
  cambios de CI. La migración necesaria queda incluida en el alcance propuesto.
- Nunca: copiar secretos o sesiones, copiar participantes/resultados como parte
  de plantillas, enviar comunicaciones por reutilizar patrocinadores, ejecutar
  pruebas destructivas contra producción o modificar archivos ajenos al alcance.

## Decisiones pendientes

- Confirmado: paquetes y categorías se copian de forma independiente, sin
  sincronización automática entre torneos.
- Revisar esta especificación, en particular las asignaciones de colaboradores
  y la distinción entre configuración global y ajustes del torneo.
- Tras su validación, preparar el plan técnico y las tareas verificables conforme
  al flujo de la skill de desarrollo guiado por especificaciones.
