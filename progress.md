# Progress Log

## Repository scaffold & tooling
- Created modular directory structure (`apps/`, `modules/`, `libs/`, `infra/`, `docs/`, `data/`) aligned with Architecture.md and documented via README files.
- Initialized pnpm workspace (root `package.json`, `pnpm-workspace.yaml`) plus shared TypeScript configs (`tsconfig.base.json`, solution `tsconfig.json`) and ESLint flat config (`eslint.config.mjs`).
- Generated placeholder packages for each app/module/lib with build/lint/test scripts, ensuring `pnpm build/lint/test` operate across the monorepo.
- Bootstrapped CORA Python sidecar using `uv` (apps/cora) with pyproject + `.python-version`.

## Domain modules & libraries
- Added `libs/db` defining the shared schema types (BOMs, suppliers, certificates, regulations, etc.) and a Postgres-backed `DatabaseClient` factory using `pg`.
- Built out module layers (controllers/services/repositories/DTOs) for Compliance, Supplier, Risk/Impact, File/Document, Jobs & Workflows, Search/RAG, and Gateway, all referencing the shared schema.
- Added `ApiModuleFactory` to wire modules together, and worker bootstrap helpers for Temporal orchestration.

## Database & local infra
- Authored SQL migrations (`infra/db/migrations/*.sql`) to create the Architecture.md §2 data model, helper triggers, the `create_bom` procedure, materialized-style compliance views, and the regulation search function expected by the repositories.
- Added a pgvector-enabled Postgres + Redis stack via `infra/docker/docker-compose.yml` plus README instructions for bootstrapping local services.
- Introduced a migration runner (`libs/db/scripts/run-migrations.mjs`) with `pnpm db:migrate` to keep environments in sync, plus a deterministic seed script (`libs/db/scripts/seed-sample-data.mjs`) wired to `pnpm db:seed` to load the sample tenant/BOM/suppliers/certificates.

## Security & auth
- API now validates OAuth2.1/JWT access tokens via `@certivo/lib-auth` (JWKS or HS256 secret), derives tenant + roles from claims, and propagates identities to controllers/logs.
- Added AsyncLocalStorage-backed tenant contexts in `@certivo/lib-db` so every Postgres query sets `app.current_tenant`/`app.current_roles`, enabling enforced RLS policies.
- Authored `003_rls_policies.sql` to enable and force row-level security across tenant tables/views, plus convenience helpers/seed bypass hooks so local scripts remain idempotent.

## API runtime
- Implemented Express server in `apps/api/src/main.ts` with tenant middleware, JSON parsing, centralized error handling, and route adapters that forward to gateway controllers.
- Added a placeholder `WorkflowClient` implementation and environment-driven Postgres connection (via `createPgDatabaseClient`).
- Ensured `/healthz`, `/bom/upload`, `/merged/:id`, `/supplier/*`, `/impact/predict`, `/documents/*`, and `/search` are all wired.
- Added structured logging, request correlation IDs, health/ready/metrics probes, Prometheus instrumentation, and request validation (Zod) within the gateway middleware. Wired certificate upload ingestion and schema checks for document, supplier, and impact payloads.

## Compliance ingestion
- Implemented certificate upload DTOs/services to normalize concentrations, persist certificates/findings transactionally, and surface data-quality issues during ingestion.

## Verification
- Running `pnpm build`, `pnpm lint`, and `pnpm test` succeeds across the workspace (tests currently stubs).

## Frontend dashboard setup
- Replaced the placeholder web package with a real Next.js 14 + Tailwind app (apps/web) per Architecture.md §6, including shared Role context, TanStack virtual table, Recharts visualizations, Impact Simulator controls, CORA audit feed, Ops Center stream, and SLA monitor gates.
- Added localized supplier outreach previews (de/zh/en), status badge helpers, mock data generators, and SectionCard primitives so the dashboard mirrors the Architecture spec.
- Updated workspace lint/typecheck/build scripts plus Tailwind/PostCSS/tsconfig overrides, ensuring `pnpm --filter @certivo/web lint|typecheck|build` all pass.

## Dashboard data wiring
- Implemented `@certivo/dashboard` service + `/dashboard/snapshot` API endpoint that aggregates BOM coverage, supplier scorecards, risk stats, audit logs, ingestion issues, SLA leaderboard, and default PFAS impact previews straight from Postgres (Architecture.md §6–§7).
- Replaced the frontend mock data with live fetches (server components + proxy route for `/api/impact`) so BOM Explorer, Supplier Scorecards, Risk viz, Impact Simulator, Audit feed, Ops Center, and SLA monitor all render the seeded tenant data behind JWT auth.
- Added Certivo API env helpers plus docs for `CERTIVO_API_URL`/`CERTIVO_API_TOKEN` so `pnpm --filter @certivo/web dev|build` knows how to authenticate against the Express gateway.

## Recent updates
- Corrected the dev JWT generator (`infra/docker/generate-dev-token.mjs`) to emit HS256 signatures without double-encoding so Architecture.md §7 auth flows accept tokens in local dashboard sessions again.
- Bootstrapped the local dev runtime: brought up Docker Compose services, ran `pnpm db:migrate`/`pnpm db:seed`, generated the seed tenant JWT, and launched the API (`node dist/main.js`) plus web (`pnpm dev`) with `CERTIVO_API_URL`/`CERTIVO_API_TOKEN` configured. Noted a `/dashboard/snapshot` 500 caused by `impact_scenarios` JSON insertion (see API logs) while verifying the dash fetch.
- Patched `RiskRepository.recordScenarioResult` to persist structured JSON (regulation metadata + deltas) and rebuilt/restarted services, restoring `/dashboard/snapshot` and the Next.js dashboard to 200 responses.
- Normalized SLA aggregates in `DashboardService` so numeric fields from Postgres averages (`avg_days`, `sla_days`) are parsed to numbers before rounding, preventing `NaN`/`null` values in the `/dashboard/snapshot` payload and keeping the SLA monitor widget stable.
