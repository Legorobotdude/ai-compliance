# Web Application

Next.js 14 + Tailwind frontend that renders the Architecture.md §6 dashboard surfaces (BOM Explorer, Supplier Scorecards, Risk viz, Impact Simulator, Audit/LLM feed, Ops Center, SLA monitor) against tenant-scoped APIs.

## Getting started

### 1. Start the API server

First, ensure the API is running (see `apps/api/README.md`). The API needs these environment variables:

```bash
export DATABASE_URL="postgres://certivo:certivo@localhost:5432/certivo"
export AUTH_JWT_SECRET="dev-secret"
export AUTH_ISSUER="https://auth.dev.certivo"
export AUTH_AUDIENCE="certivo-api"

# Start the API
pnpm --filter @certivo/api dev
```

### 2. Generate a JWT token

Generate a JWT token with the seeded tenant ID:

```bash
# From the repo root
node infra/docker/generate-dev-token.mjs
```

This will output a token. Copy it for the next step.

### 3. Configure the web app

Set the required environment variables:

```bash
export CERTIVO_API_URL="http://localhost:4000"
export CERTIVO_API_TOKEN="<token-from-step-2>"
```

### 4. Start the dev server

```bash
pnpm --filter @certivo/web dev     # start the Next.js dev server
pnpm --filter @certivo/web lint    # eslint (flat config shared at repo root)
pnpm --filter @certivo/web typecheck
pnpm --filter @certivo/web build   # production build
```

## Environment

- `CERTIVO_API_URL`: Base URL for the Express gateway (e.g., `http://localhost:4000`).
- `CERTIVO_API_TOKEN`: JWT with the seeded tenant context. Generate using `node infra/docker/generate-dev-token.mjs` (see `infra/docker/README.md` for details).

Both variables must be present for dev, lint, and build steps because `/dashboard/snapshot` + `/impact/predict` are fetched at build time for prerendering/static analysis.

## Responsibilities

- Implement route groups for dashboards and detail views, mirroring Architecture.md.
- Provide shared UI components (virtualized TanStack Table, Recharts-based viz, localized CORA email previews).
- Integrate with role-aware UI gates (viewer/analyst/admin) plus supplier outreach i18n.
- Handle client telemetry hooks, feature flags, and API wiring in follow-on stories.
