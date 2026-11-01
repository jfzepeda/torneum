<claude-mem-context>
# Memory Context

# [torneum] recent context, 2026-10-25 1:10pm CST

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,877t read) | 398,055t work | 96% savings

### Oct 25, 2026
31487 11:37a 🟣 Torneum Full Stack Verified End-to-End — Public API, Images, Sponsor Logos, and Frontend All Working
31488 11:46a 🔵 Sponsor Logo Image Structure in torneum Frontend
31489 11:49a 🟣 Tournament Details and Venue Section Added
31490 " 🔵 Torneum Public Portal Structure and Tournament Type Shape
31491 " 🔵 Torneum Portal Layout and Sponsor Section CSS Patterns
31492 " 🟣 TournamentDetails Section Added to Public Portal
31493 11:51a ✅ TournamentDetails Section Restyled to Full-Bleed Layout
31494 11:53a ✅ TournamentDetails CSS Reverted from Full-Bleed to Contained Layout
31495 " ⚖️ Reference Design Source for TournamentDetails Section
31496 12:03p 🔵 Backend Structure and Git Status
31497 " 🔵 Tournament Table Schema and Update Route
31498 " 🔵 Admin Settings Form Structure and Migration System
31499 12:04p ⚖️ Adding `highlights` jsonb Field to Tournaments Instead of venue_address
31500 " ⚖️ Full-Stack Highlights Feature Wired: Types, Public Portal, Admin Form
31501 " 🔵 Migration Applied, OpenAPI Regenerated, Backend Tests Pass
31502 " 🔵 Demo Highlights Seeded into Local Dev Tournament
31503 " 🔵 Public API Confirmed Returning highlights Array
31504 12:05p ⚖️ Fixed .tournament-details to Strict 2-Column Grid
31505 12:06p 🔵 Venue Field Used in 4 Places in public.tsx
31506 " ⚖️ Venue Field Split by " · " Separator for Better Display
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
S5356 Create a hydrated Padelón tournament in torneum using real sponsor and tournament data from ~/Developer/Web/padelon — no fabricated participants (Oct 25 at 12:26 PM)
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
S5357 Refactor SponsorsPage from public.tsx into a separate file in the Torneum frontend (Oct 25 at 12:29 PM)
31543 12:38p 🔄 SponsorsPage Extracted to Separate File
31544 " 🔵 SponsorsPage vs Sponsors: Two Distinct Components in Torneum Frontend
S5358 SponsorLogo in presented.map should have no fixed width — only 280px height, free width (Oct 25 at 12:38 PM)
31545 12:39p ✅ SponsorLogo Width Removed from presented.map Items
31546 " 🔵 SponsorLogo CSS Constrains Width Despite width:auto
S5360 Refactorizar public.tsx por secciones + absorber sponsors-public.tsx + añadir botón "Inscribirme" en TournamentDetails (Oct 25 at 12:40 PM)
31547 12:43p 🔄 public.tsx refactor: sponsors section extracted to sponsors-public.tsx
S5361 Refactorizar public.tsx por secciones — sesión completada con absorción de sponsors-public.tsx y botón "Inscribirme" en TournamentDetails (Oct 25 at 12:43 PM)
S5359 Refactorizar frontend/src/components/public.tsx por secciones — dividir en carpeta con un archivo por sección (Oct 25 at 12:43 PM)
S5362 Refactorizar public.tsx por secciones — completado, más botón "Inscribirme" reposicionado dentro del cuadro de categorías en TournamentDetails (Oct 25 at 12:43 PM)
S5363 Production readiness assessment for Torneum — how far from deploying to production? (Oct 25 at 12:47 PM)
31548 12:48p 🔵 Torneum Frontend Stack and Environment Audit
31549 " 🔵 No Deployment Infrastructure Configured for Torneum
31550 " 🔵 Backend Test Suite: 20/53 Pass, 33 Multi-Tenancy Tests Skipped, Build Clean
31551 " 🔵 Torneum Backend Requires 21 Environment Variables for Full Production Operation
S5364 Cloudflare deployment feasibility analysis for Torneum — can the full stack deploy on Cloudflare? (Oct 25 at 12:49 PM)
31552 1:02p ⚖️ Cloudflare Deployment Evaluated as Target Platform for Torneum
S5365 Vercel + Railway selected as deployment platform for Torneum — deployment plan defined (Oct 25 at 1:02 PM)
**Investigated**: Vercel compatibility with Next.js frontend, Railway compatibility with Fastify backend (Node.js, sharp, nodemailer, outbox, Google sync), Railway managed PostgreSQL networking, cost implications of Vercel Hobby vs Pro, cookie domain requirements for sameSite:lax across Vercel+Railway, trustProxy requirement for Railway's reverse proxy, and migration strategy for pre-deploy.

**Learned**: - Vercel + Railway is the optimal deployment path: no code rewrites needed, all Node.js dependencies (sharp, nodemailer, SMTP) work natively on Railway
    - Next.js output:"standalone" is unnecessary on Vercel — Vercel handles Next.js natively without it
    - Railway uses Nixpacks for builds; pnpm build + pnpm start works without a Dockerfile
    - Railway's reverse proxy requires trustProxy: true in Fastify — without it, rate limiting sees one IP for all users
    - Cookie sameSite:"lax" requires frontend and backend to share a registrable domain (e.g., app.domain.com + api.domain.com) — mismatched domains will break login
    - Background jobs (outbox, Google Forms sync) run in-process — multiple Railway replicas would cause duplicate execution; single instance required at launch
    - pnpm migrate must run as a pre-deploy step in Railway before the backend starts
    - Vercel Hobby plan prohibits commercial use — Vercel Pro (~$20/month) required for a production product
    - Railway costs approximately $5–15/month at this scale
    - Postgres on Railway shares a private network with the backend — no connection pooler or Hyperdrive needed

**Completed**: Platform decision finalized: Vercel (frontend) + Railway (backend + PostgreSQL). Five-step deployment plan defined. Three required code changes identified before deployment: add trustProxy to Fastify, add pnpm migrate to Railway start sequence, verify CORS with production domains. User was offered the choice to start with the code changes or proceed through Railway/Vercel dashboards independently.

**Next Steps**: Awaiting user confirmation to begin code changes: add trustProxy:true to Fastify server config, update Railway start command to run migrations before server start, and audit CORS + FRONTEND_URL config for production domains. These are the pre-deployment code changes needed before platform setup.


Access 398k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>