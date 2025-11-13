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

### 3. Generate a JWT token for the web app

```bash
node infra/docker/generate-dev-token.mjs
```

Copy the generated token.

### 4. Create a `.dev.env`

Use the sample template to capture all required URLs/tokens:

```bash
cp .dev.env.example .dev.env
```

Then edit `.dev.env` and fill in:

- `CERTIVO_API_TOKEN` — token from step 3
- `CORA_OPENAI_API_KEY` — your OpenAI key
- (Optional) override any API/CORA URLs or database settings

### 5. Start all services (API, web, CORA)

```bash
pnpm dev
```

The script loads `.dev.env`, exports the required URLs/secrets, then launches:

- Express API (`@certivo/api`)
- Next.js dashboard (`@certivo/web`)
- CORA FastAPI sidecar (`apps/cora`)

For detailed setup instructions, see:
- `apps/api/README.md` - API server configuration
- `apps/web/README.md` - Web app configuration
- `infra/docker/README.md` - Docker setup and JWT token generation

### Optional: run the CLI lab smoke test

Exercise the same compliance + CORA flows that power the `/lab` page (Architecture.md §§3–4) straight from the terminal:

```bash
export CERTIVO_API_URL="http://localhost:4000"
export CERTIVO_API_TOKEN="<token-from-step-4>"

pnpm lab:test
```

This script uploads the sample BOM, ingests certificates, and hits `/ai/parse-document`, `/ai/supplier-email`, and `/ai/risk-summary` through the Express gateway so you can validate the end-to-end path without opening the UI.

## Next steps

1. Scaffold package managers/workspaces (pnpm + uv) and baseline tsconfig/eslint settings.
2. Flesh out module entrypoints (controllers, services, repositories) referencing the shared database schema.
3. Wire Docker Compose for local dev (api, web, worker, cora, postgres, redis, minio, temporal).
