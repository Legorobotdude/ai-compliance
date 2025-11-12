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

## API runtime
- Implemented Express server in `apps/api/src/main.ts` with tenant middleware, JSON parsing, centralized error handling, and route adapters that forward to gateway controllers.
- Added a placeholder `WorkflowClient` implementation and environment-driven Postgres connection (via `createPgDatabaseClient`).
- Ensured `/healthz`, `/bom/upload`, `/merged/:id`, `/supplier/*`, `/impact/predict`, `/documents/*`, and `/search` are all wired.

## Verification
- Running `pnpm build`, `pnpm lint`, and `pnpm test` succeeds across the workspace (tests currently stubs).
