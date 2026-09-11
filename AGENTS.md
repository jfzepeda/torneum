<claude-mem-context>
# Memory Context

# [torneum] recent context, 2026-09-10 9:08pm CST

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 36 obs (11,301t read) | 151,136t work | 93% savings

### Sep 10, 2026
24276 2:12p ⚖️ Torneum Platform Architecture Decided: Next.js + Fastify + PostgreSQL
24277 " 🔵 Critical Environment Blockers: No Network, No Docker, PostgreSQL Stopped
24278 2:18p 🟣 PostgreSQL 16 Local Cluster Bootstrapped for Development
24279 " 🟣 Tournament Draw, Bracket, and Auto-Schedule Engine Implemented
24280 " 🟣 Centralized State Aggregator and Outbox Email/WhatsApp Layer Implemented
24281 2:24p 🔴 TypeScript Build Fixed: Invalid Fastify Import Syntax in app.ts
24282 " 🔴 shadcn CLI Failed Framework Detection Without next.config.ts
24283 " 🟣 Full Fastify REST API Implemented with Role-Based Routes and Sponsor CRM
24284 " 🟣 Demo Seed Script Implemented with 24 Teams, 3 Categories, Draws, and Results
24289 7:22p 🔵 Torneum Monorepo Uses npm with Two Sub-packages
24290 " ✅ Added `packageManager: pnpm@11.5.2` to Both Package Manifests
24291 " ✅ Torneum Both Packages Fully Migrated to pnpm
24292 " ✅ pnpm Migration Initiated for Both Repos
24296 7:27p ✅ Migration of Both Repos to pnpm Initiated
24298 " 🔵 pnpm Fetch Config: .npmrc Works, ENV Vars Don't, CLI Flag Placement Matters
24299 " 🔴 Backend pnpm Install Fixed via .npmrc with Extended Fetch Timeouts
24300 7:35p ⚖️ pnpm Migration Requested for Both Repositories
24293 " ✅ packageManager Field Added to Both Repos
24294 " 🔵 Backend pnpm Install Failed: Network Timeout on typescript@7.0.2 and sharp
24295 " 🔵 pnpm 11.5.2 Rejects --config.network-concurrency as String
24301 7:40p 🔵 pnpm CLI Config Flag Syntax for fetch-timeout
24297 7:41p 🔵 pnpm Install Blocked by Network Timeouts on Two Darwin ARM64 Packages
24302 7:56p 🔵 Backend pnpm Install Stalled — Lockfile Not Yet Created
S4098 Migrate both repos (torneum/backend and torneum/frontend) to pnpm (Sep 10 at 7:56 PM)
S4099 Migrate both repos (backend and frontend) from npm to pnpm (Sep 10 at 7:56 PM)
S4100 Migrate both repos (backend + frontend) from npm to pnpm — backend install in progress (Sep 10 at 7:56 PM)
S4101 Migrate both torneum repos (backend + likely frontend) from npm to pnpm (Sep 10 at 8:21 PM)
24303 8:51p 🔵 pnpm install failing in torneum/backend with fetch retry errors and type error
24304 " 🔵 pnpm ignores fetch-timeout in .npmrc — returns undefined
S4102 Migrate both torneum repos (backend + frontend) from npm to pnpm (Sep 10 at 8:51 PM)
24305 8:52p ✅ torneum/backend successfully migrated to pnpm
24306 " 🔵 pnpm build exits 0 despite esbuild ignored-builds error blocking internal pnpm install
24307 " 🔵 pnpm 11.x no longer reads the "pnpm" field in package.json
24308 " 🔵 onlyBuiltDependencies in pnpm-workspace.yaml also fails to whitelist esbuild builds
24309 " ✅ esbuild build scripts approved via pnpm approve-builds; backend install now clean
24310 8:53p ✅ torneum/backend pnpm migration complete — build and tests pass
24311 8:58p ✅ Frontend migrated to pnpm successfully
24312 " ✅ Frontend TypeScript typecheck passes after pnpm migration
S4103 Migrate both repos (frontend and backend) to pnpm (Sep 10 at 8:58 PM)
24313 8:59p ✅ Frontend production build succeeds after pnpm migration
24314 " ✅ Both torneum repos fully migrated to pnpm — final git state confirmed
24315 9:00p ✅ backend/pnpm-workspace.yaml requires allowBuilds for esbuild

Access 151k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>