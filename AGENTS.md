<claude-mem-context>
# Memory Context

# [torneum] recent context, 2026-11-01 12:35pm CST

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,379t read) | 336,258t work | 95% savings

### Oct 25, 2026
31507 12:08p 🔵 Venue TextField Appears in 3 Locations Across Frontend
31508 " 🔵 Dashboard Venue Form is the Initial Tournament Setup Screen
31509 " ⚖️ Venue Split into Two Form Fields: "Club / Sede" + "Ciudad" — No DB Schema Change
31510 12:09p 🔵 No Color/Theme/Brand Fields Exist in DB or Types
31511 " 🔵 Organizations Table Has Only slug Added; Primary Color Hard-Coded in globals.css
31512 12:10p 🔵 Complete Map of Venue and Organization Usages Across Full Stack
31513 " 🔵 Complete Theme Token Map and Shell Component Locations
31524 12:22p 🟣 User Requested Shadow/Relief on Official Sponsor Cards
31525 " 🔵 Sponsor Card Markup and Container Structure Located
31526 " 🟣 Sponsor Cards Get Box-Shadow Relief and Hover Lift Animation
31533 12:28p 🔵 Padelon Tournament Hydration Task Initiated
31534 " 🔵 Padelon Project Structure and Content Extracted
31535 " 🔵 Padelon Tournament Detailed Data Extracted
31536 " 🔵 Torneum Backend Project Structure Confirmed
31537 " 🔵 Torneum Full Database Schema and Seed Script Analyzed
31538 " 🔵 Padelon Brand Colors and Image Hosting Confirmed
31539 12:29p 🔵 Torneum Sponsor Business Rules and Frontend Routing Confirmed
31540 " 🟣 Padelon Hydration Script Written
31541 " 🟣 Padelon Tournament Successfully Hydrated into Torneum DB
31542 " 🟣 Padelon Tournament Live and Verified on Both API and Frontend
31543 12:38p 🔄 SponsorsPage Extracted to Separate File
31544 " 🔵 SponsorsPage vs Sponsors: Two Distinct Components in Torneum Frontend
31545 12:39p ✅ SponsorLogo Width Removed from presented.map Items
31546 " 🔵 SponsorLogo CSS Constrains Width Despite width:auto
31547 12:43p 🔄 public.tsx refactor: sponsors section extracted to sponsors-public.tsx
S5363 Production readiness assessment for Torneum — how far from deploying to production? (Oct 25 at 12:47 PM)
31548 12:48p 🔵 Torneum Frontend Stack and Environment Audit
31549 " 🔵 No Deployment Infrastructure Configured for Torneum
31550 " 🔵 Backend Test Suite: 20/53 Pass, 33 Multi-Tenancy Tests Skipped, Build Clean
31551 " 🔵 Torneum Backend Requires 21 Environment Variables for Full Production Operation
S5364 Cloudflare deployment feasibility analysis for Torneum — can the full stack deploy on Cloudflare? (Oct 25 at 12:49 PM)
31552 1:02p ⚖️ Cloudflare Deployment Evaluated as Target Platform for Torneum
S5365 Vercel + Railway selected as deployment platform for Torneum — deployment plan defined (Oct 25 at 1:02 PM)
S5693 Localizar recursos de patrocinadores de Padelón en la DB local de Torneum — completado con lista completa de 32 sponsors (Oct 25 at 1:02 PM)
### Nov 1, 2026
33423 12:14p 🔵 Proyecto Torneum: estructura backend identificada
33424 " 🔵 Padelon es un sitio estático separado de Torneum
33425 " 🔵 Torneum backend: estructura de código fuente y migraciones SQL
33426 12:15p 🔵 Schema de patrocinadores en migrations/001_core.sql
33427 " 🔵 33 patrocinadores de Padelón Series 2026 localizados en la DB local
S5692 Localizar los recursos de los patrocinadores de Padelón en la base de datos local de Torneum (Nov 1 at 12:15 PM)
S5694 Localizar y migrar los recursos de patrocinadores de Padelón a producción — 32 sponsors copiados de DB local a Railway (Nov 1 at 12:15 PM)
33428 12:16p 🔵 La DB de producción (Railway) está vacía de sponsors vs DB local con 32
33429 " 🟣 32 patrocinadores de Padelón migrados de DB local a producción (Railway)
S5695 Sincronización completa de datos de padelon (sponsors + branding) de DB local a producción Railway (Nov 1 at 12:16 PM)
33430 12:18p 🔵 Schema de branding de organizaciones en migration 009_branding_city.sql
33431 " 🔵 Colores de marca de padelon difieren entre local y producción
33432 " ✅ Colores de marca de padelon sincronizados de local a producción
S5698 Cómo borrar una categoría en Torneum — no existe endpoint DELETE, investigación de dependencias FK (Nov 1 at 12:18 PM)
33438 12:24p 🔵 No existe endpoint de borrado de categorías en Torneum
33439 " 🔵 Tablas dependientes de categories: groups, matches y teams tienen FK hacia ella
S5697 Cómo borrar una categoría en Torneum — investigación de rutas y dependencias FK (Nov 1 at 12:24 PM)
33440 12:25p 🔵 Aislamiento multitenant de categorías implementado en código, no en RLS de Postgres
33441 " 🔵 Patrón de rutas de Torneum usa helper post() tipado; no existe helper delete()
33442 " 🔵 Ruta /v1/categories/update con guardas de integridad y patrón idempotente
33443 " 🔵 FK compuestas de categories incluyen organization_id — 5 tablas dependientes confirmadas
33444 12:26p 🟣 Endpoint POST /v1/categories/delete implementado en backend/src/app.ts
33445 " 🟣 Botón "Eliminar" categoría agregado al frontend con confirmación y guardia client-side
33446 " 🟣 Backend compilado y OpenAPI regenerado con ruta /v1/categories/delete
33447 " 🔵 openapi-typescript@7 incompatible con TypeScript 7 en Node.js 24
S5699 Implementar borrado de categorías en Torneum — endpoint backend + botón frontend completados, pendiente commit y deploy (Nov 1 at 12:27 PM)
**Investigated**: Rutas existentes de categorías, dependencias FK en 5 tablas (teams, groups, matches, tournament_registrations, google_form_jobs), patrón RPC-over-POST del proyecto, sistema de permisos y auditoría, función bulkVerify del frontend.

**Learned**: - Torneum usa POST para todas las mutaciones (patrón RPC-over-POST), no HTTP DELETE/PATCH
    - La función ensure() usa status=409 por defecto; 404 requiere pasarse explícitamente
    - openapi-typescript@7.13.0 es incompatible con TypeScript 7.0.2 en Node.js v24 — ts.factory aparece undefined; el fallo preexistía antes de este cambio
    - Los 33 tests del backend se saltean por requerir una DB de pruebas; los 20 que corren pasan
    - La guardia de borrado cubre también equipos rejected/withdrawn (any team con category_id, no solo activos)

**Completed**: 1. POST /v1/categories/delete en backend/src/app.ts: verifica propiedad (org_id), cuenta dependencias en 5 tablas, borra si vacía, registra en audit_events como category.delete
    2. Botón "Eliminar" (destructive) en frontend/src/components/operations.tsx: solo visible si !draw_published && !teams asociados, con confirmación window.confirm
    3. bulkVerify refactorizada para aceptar body opcional
    4. Backend compila (BUILD_OK), openapi.json regenerado con /v1/categories/delete, frontend typecheck pasa (TYPES_OK), 20/53 tests pasan

**Next Steps**: Probar manualmente en local (crear categoría vacía y borrarla; intentar borrar una con parejas para verificar el bloqueo). Hacer commit. Desplegar a producción si la prueba es exitosa. Opcionalmente: corregir la incompatibilidad de openapi-typescript para regenerar api-schema.d.ts.


Access 336k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>