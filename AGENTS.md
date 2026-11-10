<claude-mem-context>
# Memory Context

# [torneum] recent context, 2026-11-10 4:13pm CST

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,248t read) | 885,421t work | 98% savings

### Nov 1, 2026
33525 6:37p 🔵 CalendarView: UX de Arrastrar/Soltar con Confirmación Modal Antes de Publicar
33526 " 🔵 Sponsors: Selección Múltiple con Checkboxes y Acciones Bulk — Patrón Correcto
33527 " 🔵 GoogleRegistrations: Acciones Bulk con window.confirm() Nativo — Inconsistencia UX
33528 " 🔵 API Backend: Endpoints Disponibles para Quick Actions No Usados en Frontend
33529 " 🔵 payments.tsx: Usa window.prompt() Nativo para Confirmar Pago Externo
33530 " 🔵 GoogleRegistrations: Inbox con Bulk Actions Avanzadas — "Aceptar Válidas" como Acción de Una Página
33531 6:39p 🔵 Backend Torneum: Estructura de Módulos y Función post() Centralizada
33533 6:40p 🔵 workspace-access.ts: Mapa de Autorización que Debe Actualizarse al Agregar Nuevos Endpoints
33532 " 🔴 Botón "Confirmar pago externo" con margen superior corregido
33534 " 🔵 Confirmado: /v1/registrations/review Soporta Aprobación Rápida sin Cambios de Backend
33535 " 🔵 Restricciones de FK: Eliminar Canchas y Paquetes de Patrocinio Requiere Cuidado
33536 6:41p 🟣 Backend: Nuevo Endpoint /v1/registrations/review-bulk para Aprobación Masiva
33537 " 🟣 Backend: reviewTeam() Limpiada y Lista — app.ts Compilable
33538 " 🟣 Backend: 8 Nuevos Endpoints de Acciones Rápidas — Compilado y Tests Pasando
33543 " 🟣 Imágenes para landing page de Torneum
33539 6:45p ✅ Eliminación del botón del panel organizador en el portal público
33540 " 🔵 Estructura del portal público en torneum/frontend
33541 " ✅ Botón "Organizador" eliminado de la navegación del portal público
33542 " ✅ Selector de torneo (picker) eliminado de la navegación pública
S5733 Auditoría masiva de Torneum: mejoras de UI/backend, cookie de inscripción y capturas para landing page (Nov 1 at 6:45 PM)
33544 " 🔵 Torneum landing page assets pending creation
33545 6:46p 🟣 Torneum landing page assets — imágenes guardadas
33546 6:48p 🔵 Intención de guardar imágenes para landing page de Torneum
S5734 Fix: error "Selecciona el torneo" al confirmar patrocinadores en vista "Todo el club" (Nov 1 at 6:49 PM)
33547 6:53p 🔵 Estructura del frontend de Torneum y assets de landing page
33548 " 🔵 src/app/page.tsx es un buscador de club, no una landing page
33550 " 🔵 Tokens de marca y dimensiones de capturas de Torneum confirmados
33549 " 🔵 Error de selector de torneo inexistente reportado
33555 " 🟣 Solicitud de creación de landing page
33556 " 🔵 Error al capturar landing con Playwright y Chromium local
33551 " 🔵 Error "Selecciona el torneo" proviene del backend, no del frontend
33552 " 🔵 Arquitectura de selección de torneo: header X-Tournament-Id y función activeTournament
33553 6:54p 🔵 Endpoints de sponsors usan `activeTournament` directamente sin recibir tournament_id en el body
33554 " 🔴 Endpoints de sponsors ahora funcionan sin selector de torneo activo
S5735 Fix error "Selecciona el torneo" en vista patrocinadores — backend fix + filtro de torneo en frontend (Nov 1 at 6:54 PM)
33557 " 🔵 El tipo `Sponsor` incluye `tournament_id` y el dashboard ya tiene selector de torneo
33558 6:55p 🔴 Landing Page CSS Specificity Fix for Global Typography Rules
S5736 Crear landing page para Torneum frontend - construcción e implementación completa de la página principal (Nov 1 at 6:55 PM)
S5738 Mover configuración de patrocinadores de GESTIÓN global a TORNEO para manejo independiente por torneo (Nov 1 at 6:56 PM)
33560 7:03p 🟣 Configuración de patrocinadores movida a nivel de torneo
S5739 Migración de rutas públicas de torneum: query params a path segments (`/club/torneo/pagina`) (Nov 1 at 7:04 PM)
33561 7:11p ⚖️ Migración de rutas de query params a path segments para páginas de torneo
33562 " 🔵 Arquitectura actual de rutas públicas en torneum/frontend
33563 " 🔵 Alcance completo del refactor de rutas: componentes y API afectados
33564 " 🔵 El backend genera URLs hardcodeadas con `/verificar` y `/mi-pareja` sin torneo
33565 7:12p 🔵 Inventario completo de links a reescribir para el refactor de rutas
33566 " 🔄 `PublicShell` migrado de `picker` a prop `torneo` para path-based routing
33567 " 🔄 `usePublic` refactorizado para requerir `torneo` obligatorio; creado `LegacyRedirect` para compatibilidad
33568 " 🔵 URLs generadas por el backend compatibles con el nuevo esquema sin cambios
33569 " 🟣 Reestructura completa de rutas públicas: segmento `[torneo]` implementado en Next.js
33570 7:13p 🔴 `operations.tsx` corregido: botón "Inscribir pareja" ahora genera URL con torneo en el path
33571 " 🔵 Bug identificado: selector de torneo en sidebar usa links con formato antiguo
S5740 Bug: selector de torneo en sidebar del dashboard generaba URLs con path antiguo (`/{slug}?view=`) (Nov 1 at 7:13 PM)
S5741 Fix: selector de torneo en sidebar del dashboard generaba URLs con path incorrecto post-refactor (Nov 1 at 7:17 PM)
S5742 Auditoría post-refactor de rutas + corrección de links residuales al portal en vez del panel (Nov 1 at 7:17 PM)
33572 7:17p 🔵 Subagente Haiku lanzado para auditar links públicos tras el refactor de rutas
33573 " 🔵 Auditoría paralela con 4 subagentes Haiku para detectar links residuales post-refactor
33574 7:18p 🔵 Tests Playwright y platform.tsx tienen referencias a rutas viejas que necesitan actualización
33575 " 🔵 Auditoría completa post-refactor: hallazgos confirmados en código activo
S5743 Refactor de rutas públicas + auditoría post-refactor + corrección de enlaces residuales y backward compatibility (Nov 1 at 7:21 PM)
**Investigated**: - Corrida completa de `google.spec.ts` con servidor de desarrollo activo (HTTP 200 en localhost:3000)
    - Investigación del fallo del test `organizer configures an extra field and uses the shared internal registration form` (línea 290)
    - Búsqueda de todos los generadores de enlaces con `?view=` y `?tournament=` en frontend/backend
    - Análisis del endpoint `/v1/registrations/internal` en `google-registrations.tsx:1863` y `backend/src/google/routes.ts:366`

**Learned**: - **`google.spec.ts` con servidor activo: 3/4 pasan**. El test que falla (`:290`) no tiene relación con el refactor de rutas — el diálogo de registro interno no se cierra tras click en "Registrar" (el mock devuelve `{ ok: true }` pero el componente puede esperar otro campo).
    - **Git status** muestra 3 archivos modificados: `platform.tsx`, `registration.tsx`, `google.spec.ts` (más los cambios de esta sesión).
    - **`LegacyRedirect`** en `app/[club]/page.tsx` recibe todas las visitas a `/{club}` sin torneo. Los enlaces guardados del panel antiguo (`/{club}?view=…&tournament=…`) llegaban al `LegacyRedirect` y se reenviaban al portal del torneo por defecto, en lugar del panel.
    - **`tournamentLink()`** en `dashboard.tsx:95` y `pushState` en líneas 211/216 ya generan `/{club}/panel?view=…` — el código actual es correcto. El problema es únicamente con enlaces guardados de producción anterior.
    - **Backend**: `app.ts:1653` y `google/routes.ts:667` ya redirigen a `/{slug}/panel?view=…` correctamente.

**Completed**: - **`LegacyRedirect`** mejorado: nueva prop `panelQuery?: boolean`. Cuando `/{club}` recibe query params con `view`, `tournament`, `status`, o `stripe`, redirige inmediatamente a `/{slug}/panel${location.search}${location.hash}` sin hacer fetch al API.
    - **`app/[club]/page.tsx`**: actualizado para pasar `panelQuery` a `<LegacyRedirect slug={club} page="" panelQuery />` para que los enlaces guardados del panel antiguo lleguen al panel correcto.
    - `tsc --noEmit` pasa después del cambio ✓
    - **`platform.tsx:168,323`**: enlaces al panel del club corregidos a `/{slug}/panel` ✓
    - **`registration.tsx`**: `Verification` usa `tournament_id` de `/v1/verify` para redirigir al torneo correcto ✓  
    - **`google.spec.ts`**: rutas actualizadas (`/panel`, `/copa-google/inscripcion`), mock con `tournaments` ✓
    - Servidor de desarrollo levantado, tests corridos, servidor detenido.

**Next Steps**: - Investigar si el fallo en `google.spec.ts:290` (diálogo interno no se cierra) es pre-existente o una regresión del refactor — comparar con `git stash` o revisar el mock de `/v1/registrations/internal`
    - Actualizar `app.spec.ts` con rutas correctas (`/{club}/panel`, `/{club}/{torneo}`, `/{club}/{torneo}/inscripcion`)
    - Hacer commit del refactor completo con todos los cambios acumulados
    - Verificar comportamiento del `ChatPanel` que no recibe torneo (ya era preexistente)


Access 885k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>