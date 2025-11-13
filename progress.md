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
- Centralized the compliance API contract per Architecture.md §3 by adding shared Zod schemas/helpers in `@certivo/compliance`, wiring controllers to parse inputs, and reusing those schemas inside the gateway to keep `/bom/upload`, `/certs/upload`, and `/merged` validation consistent.
- Implemented the BOM ingestion pipeline per Architecture.md §3: the compliance module now accepts JSON/CSV uploads (including ZIP bundles), explodes hierarchical assemblies, normalizes weights, and flags supplier linkage gaps—persisting `SUPPLIER_MISSING` issues to `ingestion_issues` while reusing component-supplier lookups.
- Integrated CORA parsing into certificate ingestion so `/certs/upload` can submit PDFs/unsupported files with just a `sourceDocumentId`. When findings are missing the compliance service now calls the CORA API via the shared client, maps AI output into normalized findings, records ambiguities/parse failures as issues, and stores the results alongside deterministic CSV/XML paths.
- Built the CORA FastAPI sidecar (Architecture.md §4) with `/ai/parse-document`, `/ai/supplier-email`, and `/ai/risk-summary` endpoints backed by async Postgres + OpenAI clients. Added prompt templates, guardrail validation/normalization, LLM logging (`llm_calls` + `audit_logs`), and README instructions for running the sidecar with `X-Tenant-Id` scoping.
- Hooked the CORA document parser into real storage extraction: the sidecar now downloads certificate files via `storage_url` (HTTP/S3/local sample fallback), converts them to text (including PDF support with `pypdf`), and feeds the normalized content into the LLM prompts.
- Added a `/lab` testing surface in the Next.js app so we can exercise the Architecture.md §§3–4 compliance ingestion and CORA endpoints via API proxies, complete with sample payload editors and real-time responses.
- Added `scripts/lab-smoke.mjs` + `pnpm lab:test` to hit the same compliance/CORA flows from the CLI, easing backend debugging when the UI isn’t running.
- Wired the Express gateway to CORA: added a dedicated `@certivo/cora` client/service, exposed `/ai/parse-document`, `/ai/supplier-email`, and `/ai/risk-summary` routes via ApiController, and introduced `CORA_API_URL`/`CORA_API_KEY` envs so the monolith can proxy tenant-scoped AI calls to the FastAPI sidecar.
- Added a root `pnpm dev` helper (scripts/dev.sh) plus `.dev.env.example` so devs can load all required API/Web/CORA URLs/tokens and launch the Express API, Next.js dashboard, and CORA sidecar together.
- Escaped the CORA document-parse prompt placeholders so Python `.format` no longer interprets the schema description as fields, restoring `/ai/parse-document` handling during the smoke test.
- Raised the CORA OpenAI request timeout default to 90s to give document parsing (Architecture.md §4 pipeline) extra headroom during longer completions.
- Relaxed the CORA certificate finding schema to accept missing `concentration_value` outputs and updated ppm conversion to guard against `None`, preventing fastapi validation crashes while keeping data normalization intact.
- Synced the Node gateway’s CORA client with the `.dev.env` timeout so `CORA_API_TIMEOUT_MS` always propagates (even if the API options omit it), eliminating the 10s hard stop during `/ai/parse-document` smoke tests.
- Made CORA risk summary gaps tolerant of OpenAI variations by aliasing `supplier` → `supplier_name` and normalizing free-form reasons to the Architecture.md enums before validation, preventing `/ai/risk-summary` 500s.
- Surveyed the File/Document module versus Architecture.md §1 expectations, cataloged current API/storage behavior, and drafted a presigned-upload + MinIO-friendly implementation plan (virus scanning hooks, retention, tenant encryption) to guide the next build-out step.
- Implemented Architecture.md §1 Step 1–2: added a `004_document_lifecycle` migration + schema/types for upload/scan states, storage metadata, and retention timestamps; introduced `@certivo/lib-storage` with a filesystem-backed adapter; and wired the document service/API to persist inline uploads locally (sha256/length validation, file:// URLs) so local dev flows work without MinIO.
- Added signed download plumbing so CORA can fetch documents via the API: introduced an HMAC-based `DocumentUrlSigner`, a `/documents/raw` streaming route backed by the storage adapter, new env wiring (`DOCUMENTS_*`), and download-token helpers in the document service/controller.
- Updated the gateway, Compliance service, and CORA client/sidecar to attach those signed URLs to every `/ai/parse-document` call (with fallback to existing storage URLs), ensuring the FastAPI worker can stream files over HTTP when running via `pnpm dev` while keeping sample S3/MinIO flows intact.
- Added `scripts/lab-document-smoke.mjs`, a document-focused variant of the lab smoke harness that uploads an inline CSV (base64 path) plus a pre-signed reference, verifies `/documents/upload` + `/documents/:id`, and enforces sha256/byte checks so File/Document coverage from Architecture.md §1 is easy to regression test.
- Hardened `scripts/lab-document-smoke.mjs` with inline-upload fallback detection (auto replays via storageUrl when the API’s strict schema lags) and updated `scripts/dev.sh` to run `pnpm build` before launching services so restarting the lab stack picks up validation changes (e.g., `dataBase64` support) automatically.
- Fixed the document smoke harness so its signed download step tolerates snake_case DB rows—`verifyRawDownload` now pulls the tenant ID from either `tenantId`, `tenant_id`, or `CERTIVO_TENANT_ID`, keeping the `/documents/raw` signature path in line with Architecture.md §1’s gateway download flow even when the API omits camelCase fields.
- Updated the File/Document repository queries to alias every column to camelCase so inserts and fetches return schema-compliant `Document` objects, preventing `/documents/raw` from crashing when `storageUrl` (and other lifecycle metadata) came back as `undefined`.
- Drafted a phased implementation plan for the Risk/Impact service that ties Architecture.md §§1 & 5 requirements to the current module scaffolding (controllers/services/repository in `modules/risk-impact`), covering data hydration, scenario computation, caching, alerts, and verification steps.
- Completed Phase 1 for the Risk/Impact service by enriching `RiskRepository` with regulation context loaders, compliance snapshot helpers, supplier stats, scenario history retrieval, and data-freshness cursors, adding DTOs for those shapes, wiring camelCase mappers for `v_compliance_status`, and updating `RiskImpactService` to consume the new regulation context path.
- Connected the dashboard snapshot to the enhanced risk-impact data by surfacing recent impact scenarios and a risk-data freshness cursor, ensuring `/dashboard/snapshot` exposes Architecture.md §5 telemetry alongside the impact preview.
- Added `scripts/risk-impact-smoke.mjs` plus the `pnpm risk:test` helper so engineers can validate `/impact/predict` + `impact_scenarios` persistence end-to-end without running the full lab workflow.
- Wired the Next.js dashboard’s Impact Simulator to display persisted scenario history and risk-data freshness metadata (Architecture.md §5), so analysts can see the last slider runs and when compliance inputs last changed directly in the UI.
- Completed Phase 2 of the Risk/Impact simulator (Architecture.md §5): replaced the single-limit math in `RiskImpactService` with a pure `evaluateImpactScenario` helper that accepts multi-substance vectors, reuses document-specific thresholds, emits supplier/assembly rollups, and records TTL-aware scenario metadata (vector + baseline) through the repository for history reuse.
- Updated the API contract and downstream surfaces to match the new simulator: `ImpactPredictRequest/Response` now expose vectors/baselines, the dashboard + Next.js proxy submit PFAS limit arrays, and `scripts/risk-impact-smoke.mjs` exercises the richer payload so `/impact/predict` smoke tests cover the Phase 2 engine end-to-end.
- Completed Phase 3 of the Risk/Impact plan (Architecture.md §§5-6, lines 247-262): extended the `@certivo/risk-impact` DTOs/repos with risk score weights, framework coverage, exposure, and supplier gap snapshots; added a cached `getRiskAnalyticsSnapshot` that computes the w1–w4 formula (over-limit, missing/expired, expiry pressure, supplier responsiveness) plus donut/trend/bubble/gap projections; and rewired the dashboard/Next.js UI to consume the new analytics (risk score card + gap list) so the RiskVisualization block now reflects the architecture dashboards.
- Patched the PFAS impact simulator regression: normalized the PFAS sample certificate (`Sample Data/cert_rohs.csv`) to keep BP-44001 compliant at baseline, tightened the evaluator fallback so unknown findings reuse the strictest limit, aliased `regulation_limits.limit_ppm` to the DTO shape, and upgraded `scripts/risk-impact-smoke.mjs` to fail if `/impact/predict` returns zero deltas—ensuring the dashboard slider + API stay wired per Architecture.md §5.
- Relaxed the CORA document-parse request validator to accept `http`, `https`, `s3`, and `file` download URLs so the File/Document module (Architecture.md §1) can pass remote object references straight through; this unblocks `/ai/parse-document` during the lab smoke test now that the document service returns signed S3 URLs when it can’t stream via the gateway.
- Normalized the CORA risk summary repository (Architecture.md §5) to coerce `v_compliance_status.findings` JSON into dictionaries before formatting, preventing `/ai/risk-summary` 500s when Postgres returns text instead of decoded arrays.
- Hardened the CORA risk summary gap normalizer (Architecture.md §4) so free-form reasons like "Expired and over-limit parts" collapse to the required enum values, keeping `/ai/risk-summary` responses within the validated schema and stopping the 500s observed in the node/cora logs.
- Hardened the Next.js dashboard build (Architecture.md §6) by lazy-loading `CERTIVO_API_URL`/`CERTIVO_API_TOKEN`, forcing the `/` and `/lab` routes to be dynamic, and removing Google Font downloads so `pnpm --filter @certivo/web build` succeeds even when env vars or external networks aren't present.
- Added a `/risk-impact` showcase page in the Next.js app that spotlights the RiskImpactService (Architecture.md §§4–6): it reuses the live risk snapshot, introduces a Supplier Exposure Matrix, and surfaces the telemetry freshness card so analysts can validate ingestion recency without unrelated widgets.
- Built a new Impact Scenario Workbench plus Scenario History panel on top of the `/api/impact` proxy, enabling custom limit vectors, supplier/assembly rollup diffs, and quick pointers to `pnpm risk:test` for backend smoke testing; linked the hero dashboard to the showcase for quicker access.
