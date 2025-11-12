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

## Quick start

### 1. Start infrastructure

```bash
cd infra/docker
docker compose up -d
```

### 2. Set up the database

```bash
# From repo root
pnpm db:migrate
pnpm db:seed
```

### 3. Configure and start the API

```bash
export DATABASE_URL="postgres://certivo:certivo@localhost:5432/certivo"
export AUTH_JWT_SECRET="dev-secret"
export AUTH_ISSUER="https://auth.dev.certivo"
export AUTH_AUDIENCE="certivo-api"

pnpm --filter @certivo/api dev
```

### 4. Generate a JWT token for the web app

```bash
node infra/docker/generate-dev-token.mjs
```

Copy the generated token.

### 5. Start the web app

```bash
export CERTIVO_API_URL="http://localhost:4000"
export CERTIVO_API_TOKEN="<token-from-step-4>"

pnpm --filter @certivo/web dev
```

For detailed setup instructions, see:
- `apps/api/README.md` - API server configuration
- `apps/web/README.md` - Web app configuration
- `infra/docker/README.md` - Docker setup and JWT token generation

## Next steps

1. Scaffold package managers/workspaces (pnpm + uv) and baseline tsconfig/eslint settings.
2. Flesh out module entrypoints (controllers, services, repositories) referencing the shared database schema.
3. Wire Docker Compose for local dev (api, web, worker, cora, postgres, redis, minio, temporal).
