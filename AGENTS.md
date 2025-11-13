# Repository Guidelines

CRITICAL: ALWAYS REFERENCE Architecture.md
IMPORTANT: After completing major changes, update progress.md with completed work

## Project Structure & Module Organization
- `apps/`: Deployable services (`api`, `web`, `worker`, `cora`). API hosts the Express gateway; worker runs Temporal/BullMQ workflows; web is the Next.js dashboard; cora is the Python LLM sidecar.
- `modules/`: Domain logic packaged as reusable modules (e.g., `compliance`, `supplier`, `risk-impact`). Each contains `controllers/`, `services/`, `repositories/`, and `dtos/` under `src/`.
- `libs/`: Cross-cutting utilities (`auth`, `config`, `logging`, `tracing`, `db`, `test-utils`). `libs/db` defines the Postgres schema contracts and client factory.
- `infra/`: Docker Compose and Terraform scaffolding. `docs/`: ADRs and ops runbooks. `data/sample/`: sanitized fixtures for tests/demo.

## Build, Test, and Development Commands
- `pnpm build`: Runs `tsc -b` across all workspaces to ensure TypeScript output is clean.
- `pnpm lint`: Executes ESLint via the flat config for every package.
- `pnpm test`: Placeholder command per package (replace with real test runners when ready).
- `pnpm --filter @certivo/api dev`: (after adding a script) start the Express API locally. Set `DATABASE_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, and either `AUTH_JWKS_URL` or `AUTH_JWT_SECRET`, then call endpoints with a real `Authorization: Bearer <jwt>` header (no `X-Tenant-Id` escape hatch).

## Coding Style & Naming Conventions
- TypeScript targets ES2022, strict mode, `moduleResolution: bundler`, ESM modules. Prefer descriptive async methods (`verbNounAsync` optional) and export named symbols.
- ESLint config: `typescript-eslint` recommended plus underscore-prefixed unused vars allowed (`_req`). Run `pnpm lint --fix` before submitting.
- Schema/types live in `libs/db/src/schema.ts`; reuse these instead of redefining shapes. Tests belong under each package’s `src/__tests__/` (or similar) to match workspace layout.

## Testing Guidelines
- Use `pnpm test` as the entry point. Replace the current `echo` stubs with real test runners (Vitest/Jest) and fixtures from `libs/test-utils`.
- Name files `*.spec.ts` or `*.test.ts`. Cover ingestion workflows, repository SQL, and controller wiring before merging feature branches.

## Commit & Pull Request Guidelines
- Follow conventional, descriptive commits (e.g., `feat: add supplier module DTOs`, `chore: update pnpm tooling`). Keep history atomic.
- PRs should describe the change, reference Architecture.md sections when relevant, link issues/tickets, and include testing notes (commands + outcomes). Add screenshots for UI updates and note any schema migrations or env variable additions (call out new auth env vars when applicable).
