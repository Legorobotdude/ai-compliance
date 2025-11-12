# Certivo Platform Scaffold

Initial repo layout aligned with the modular monolith architecture in `Architecture.md`.

## Top-level structure

- `apps/` — deployable applications (API, Web, Worker, CORA sidecar).
- `modules/` — domain modules shared inside the monolith (Gateway, Compliance, Supplier, Risk/Impact, etc.).
- `libs/` — cross-cutting libraries (auth, config, logging, tracing, tests).
- `infra/` — Docker + Terraform infrastructure definitions.
- `docs/` — ADRs, ops runbooks, and supporting documentation.
- `data/` — sanitized fixtures/sample payloads.
- `Architecture.md` — canonical system design reference.

## Next steps

1. Scaffold package managers/workspaces (pnpm + uv) and baseline tsconfig/eslint settings.
2. Flesh out module entrypoints (controllers, services, repositories) referencing the shared database schema.
3. Wire Docker Compose for local dev (api, web, worker, cora, postgres, redis, minio, temporal).
