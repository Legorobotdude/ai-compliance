# API Application

Node.js + TypeScript Express server that hosts the modular monolith. It wires up Gateway routing, composes domain modules (Compliance, Supplier, Risk/Impact, File/Document, Search/RAG), and exposes REST + internal RPC endpoints. All module dependencies are injected here.

## Getting started

### Prerequisites

1. Start Docker services (Postgres and Redis):
   ```bash
   cd infra/docker
   docker compose up -d
   ```

2. Run migrations:
   ```bash
   pnpm db:migrate
   ```

3. Seed sample data:
   ```bash
   pnpm db:seed
   ```

### Environment variables

Set the following environment variables before starting the API:

```bash
export DATABASE_URL="postgres://certivo:certivo@localhost:5432/certivo"
export AUTH_JWT_SECRET="dev-secret"
export AUTH_ISSUER="https://auth.dev.certivo"
export AUTH_AUDIENCE="certivo-api"
export CORA_API_URL="http://localhost:8082"
```

**Optional:**
- `PORT`: Server port (default: `4000`)
- `AUTH_JWKS_URL`: JWKS URL for OAuth2.1 token verification (alternative to `AUTH_JWT_SECRET`)
- `AUTH_TENANT_CLAIM`: JWT claim name for tenant ID (default: `tenant_id`)
- `AUTH_ROLES_CLAIM`: JWT claim name for roles (default: `roles`)
- `AUTH_EMAIL_CLAIM`: JWT claim name for email (default: `email`)
- `CORA_API_KEY`: Optional shared secret for the CORA sidecar
- `CORA_API_TIMEOUT_MS`: Override the default CORA request timeout (10s)

### Start the server

```bash
pnpm --filter @certivo/api dev
```

The API will start on `http://localhost:4000` (or the port specified by `PORT`).

### Testing the API

Generate a JWT token for testing (see `infra/docker/README.md`):

```bash
node infra/docker/generate-dev-token.mjs
```

Use the generated token in API requests:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:4000/healthz
```

## Responsibilities
- Bootstrap config, logging, metrics, and multi-tenant auth middleware.
- Register HTTP routes per module (e.g., `/bom/upload`, `/supplier/scorecard`).
- Expose healthz/metrics/readyz endpoints for infra probes.
- Publish domain events to the Jobs & Workflow module via Redis/Temporal.
