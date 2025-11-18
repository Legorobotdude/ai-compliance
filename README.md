# AI Compliance Platform

An AI-powered compliance platform that helps manufacturers manage regulatory compliance for their products. The platform ingests Bills of Materials (BOMs) and compliance certificates, uses AI (CORA) to parse documents, tracks supplier relationships, and provides risk analysis and impact simulations for regulatory changes.

## What is this platform?

This platform automates the complex process of ensuring product compliance with regulations like RoHS, REACH, and PFAS. The platform:

- **Ingests BOMs** (CSV/JSON) and **certificates** (XML/CSV/PDF) with hierarchical assembly support
- **Uses AI (CORA)** to parse unstructured documents and extract substance concentrations
- **Tracks compliance status** per component (COMPLIANT, MISSING, EXPIRED, OVER_LIMIT)
- **Manages supplier relationships** with scorecards, SLA tracking, and automated outreach
- **Simulates regulatory impact** (e.g., "What if PFAS limits drop by 90%?")
- **Provides risk visualization** and dashboards for compliance teams

## Architecture Overview

This platform is built as a **modular monolith**—a single deployable application with clear domain boundaries. This approach provides:

- **Transactional consistency** across modules
- **Simpler local development** (one codebase, shared database)
- **Future flexibility** to extract modules into microservices if needed

### Core Modules

- **Gateway/API** (Express + TypeScript): JWT auth, rate limiting, tenant scoping, request routing
- **Compliance Service**: BOM/certificate ingestion, normalization, status engine, merge logic
- **CORA AI Module** (Python FastAPI): LLM-powered document parsing, supplier email generation, risk summarization
- **Risk/Impact Module**: Regulation catalogs, limit management, impact simulations, risk scoring
- **Supplier Module**: Supplier management, scorecards, SLA tracking, request workflows
- **File/Document Module**: Upload handling, storage (S3/MinIO), document metadata
- **Jobs & Workflow Module** (Temporal): Async workflows for ingestion retries, supplier reminders, LLM reprocessing
- **Search/RAG Module**: Semantic search over regulations using pgvector embeddings

### Tech Stack

**Backend:**
- Node.js + TypeScript (ES2022, strict mode)
- Express (API gateway)
- PostgreSQL + pgvector (data + embeddings)
- Redis (queues, cache)
- Temporal (workflows)
- Python FastAPI (CORA AI sidecar)

**Frontend:**
- Next.js 14+ (App Router)
- React + TypeScript
- Tailwind CSS
- TanStack Table (virtualized grids)
- Recharts (visualizations)

**Infrastructure:**
- Docker Compose (local dev)
- Terraform (optional production)
- S3/MinIO (object storage)

**Multi-tenancy:**
- Shared database with Row-Level Security (RLS)
- JWT-based tenant scoping
- AsyncLocalStorage for tenant context propagation

## Repository Structure

```
├── apps/              # Deployable applications
│   ├── api/          # Express API gateway
│   ├── web/          # Next.js dashboard
│   ├── worker/       # Temporal workers
│   └── cora/         # Python FastAPI AI sidecar
├── modules/          # Domain modules (shared in monolith)
│   ├── compliance/   # BOM/certificate ingestion & status
│   ├── cora/         # AI integration adapters
│   ├── risk-impact/  # Risk scoring & impact simulation
│   ├── supplier/     # Supplier management & workflows
│   ├── file-document/ # Document upload & storage
│   ├── jobs-workflows/ # Temporal workflow definitions
│   └── search-rag/   # Semantic search & embeddings
├── libs/             # Cross-cutting libraries
│   ├── auth/         # JWT validation, tenant context
│   ├── db/           # Postgres client, schema, migrations
│   ├── config/       # Environment configuration
│   ├── logging/      # Structured logging
│   ├── tracing/      # OpenTelemetry instrumentation
│   └── test-utils/   # Test helpers & fixtures
├── infra/            # Infrastructure definitions
│   ├── docker/       # Docker Compose setup
│   ├── db/           # Database migrations
│   └── terraform/    # Production infrastructure (optional)
└── docs/             # ADRs, ops runbooks
```

## Quick Start

### Prerequisites

- Node.js 20+ and pnpm
- Python 3.11+ and uv (for CORA)
- Docker and Docker Compose
- PostgreSQL 15+ (or use Docker)

### 1. Start Infrastructure

You can still start Postgres/Redis manually:

```bash
cd infra/docker
docker compose up -d
```

However, the `pnpm dev` helper will now automatically invoke this compose file when your `DATABASE_URL` points to `localhost` and Postgres isn’t reachable, so you can generally skip this step unless you prefer managing containers yourself.

### 2. Set Up the Database

```bash
# From repo root
pnpm db:migrate
pnpm db:seed
```

### 3. Generate a JWT Token for Development

```bash
node infra/docker/generate-dev-token.mjs
```

Copy the generated token—you'll need it for the `.dev.env` file.

### 4. Create `.dev.env`

```bash
cp .dev.env.example .dev.env
```

Edit `.dev.env` and fill in:

- `CERTIVO_API_TOKEN` — token from step 3
- `CORA_OPENAI_API_KEY` — your OpenAI API key
- (Optional) Override API/CORA URLs or database settings

### 5. Start All Services

```bash
pnpm dev
```

This launches:
- Express API (`@certivo/api`) on port 4000
- Next.js dashboard (`@certivo/web`) on port 3000
- CORA FastAPI sidecar (`apps/cora`) on port 8000

If Postgres or Redis aren’t up yet, the script will boot `infra/docker/docker-compose.yml` for you. It also checks `TEMPORAL_ADDRESS` and runs `temporal server start-dev` automatically when pointed at `localhost` so the Jobs & Workflow module described in Architecture.md §1 is always available during development.

### Docker-First Dev Runner

If you prefer to run the entire Architecture.md §1 stack inside containers (API, web, worker, CORA, Temporal, Postgres, Redis), use the new helper:

```bash
./scripts/dev-docker.sh
```

This script loads `.dev.env`, provides the same default secrets as `pnpm dev`, and then runs `docker compose -f docker-compose.production.yml up -d --build`, giving you a production-like deployment without leaving your host environment running Node/Python processes.

#### First-Time Setup (Docker)

After starting the containers for the first time, initialize the database:

```bash
# 1. Run migrations to create database schema
docker exec certivo-api node libs/db/scripts/run-migrations.mjs

# 2. Seed sample data (optional, but recommended for testing)
docker exec certivo-api node libs/db/scripts/seed-sample-data.mjs
```

The seed script creates:
- ACME Manufacturing tenant
- Industrial Smart Hub v2 BOM (A1234-BOM)
- 3 suppliers (Zentech Components, Jinlong Precision, EverBright Materials)
- 12 compliance certificates
- Sample regulations (RoHS, REACH, PFAS)

#### Managing Containers

```bash
# View logs (all services)
docker compose -f docker-compose.production.yml logs -f

# View logs (specific service)
docker compose -f docker-compose.production.yml logs -f api

# Stop all containers
docker compose -f docker-compose.production.yml down

# Rebuild and restart
./scripts/dev-docker.sh
```

### 6. Test the System

Run the CLI smoke test to exercise the compliance + CORA flows:

```bash
export CERTIVO_API_URL="http://localhost:4000"
export CERTIVO_API_TOKEN="<token-from-step-3>"

pnpm lab:test
```

This script uploads sample BOMs, ingests certificates, and exercises the AI endpoints (`/ai/parse-document`, `/ai/supplier-email`, `/ai/risk-summary`).

## Development Workflow

### Build & Lint

```bash
pnpm build    # TypeScript compilation across all workspaces
pnpm lint     # ESLint checks (run `pnpm lint --fix` to auto-fix)
```

### Running Individual Services

```bash
pnpm --filter @certivo/api dev    # API only
pnpm --filter @certivo/web dev    # Web app only
```

### Database Migrations

```bash
pnpm db:migrate    # Run pending migrations
pnpm db:seed       # Seed sample data
```

Migrations live in `infra/db/migrations/`. The schema is defined in `libs/db/src/schema.ts`.

### Testing

```bash
pnpm test    # Run tests (per-package test runners)
```

Tests should live under each package's `src/__tests__/` directory. Use fixtures from `libs/test-utils`.

## Key Concepts

### Compliance Status Engine

Each component gets a status based on:

```
if no certificate: MISSING
else if now() > valid_until: EXPIRED
else if any finding.concentration_ppm > regulation_limit_ppm(substance): OVER_LIMIT
else: COMPLIANT
```

### Unit Normalization

Concentrations are normalized to ppm:
- `% → ppm = % * 10,000`
- `mg/kg → ppm = mg/kg` (1:1)
- Missing units → `concentration_ppm = null` with `data_quality` flag

### Multi-Tenancy

Every table includes `tenant_id`. Row-Level Security (RLS) policies enforce tenant isolation. JWT tokens must include `tenant_id` and `roles` claims, which propagate via AsyncLocalStorage to the database context.

### CORA AI

CORA (Compliance Operations & Risk Analysis) handles:
1. **Document Parsing**: PDF/SDS/CoC → structured JSON with substance findings
2. **Supplier Email Generation**: Localized, professional outreach emails
3. **Risk Summarization**: Executive summaries with top supplier gaps

All LLM calls are logged to `llm_calls` with prompt hashes (not raw content) for auditability.

## API Overview

Key endpoints:

- `POST /bom/upload` — Upload BOM (CSV/JSON)
- `POST /certs/upload` — Upload certificates (XML/CSV/PDF)
- `GET /merged?bom_id=...` — Get BOM with compliance status
- `GET /supplier/scorecard?supplier_id=...` — Supplier performance metrics
- `POST /impact/predict` — Simulate regulatory threshold changes
- `POST /ai/parse-document` — CORA: Parse unstructured document
- `POST /ai/supplier-email` — CORA: Generate supplier outreach email
- `POST /ai/risk-summary` — CORA: Generate risk summary

See `Architecture.md` §3 for detailed API contracts.

## Sample Data

Test with the "Industrial Smart Hub v2" BOM:
- Control Unit (CU-78901) with Lead finding
- Wireless Module (WM-88211) with Nickel Sulfate finding
- Battery Pack (BP-44001) with PFOA finding

Sample certificates are in `data/samples/`:
- `sample-bom.csv`
- `sample-certificates.csv`

## Documentation

- **[Architecture.md](./Architecture.md)** — Comprehensive system design, data model, API contracts, and implementation details
- **[docs/adr/](./docs/adr/)** — Architecture Decision Records
- **[docs/ops/](./docs/ops/)** — Operations runbooks
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** — Deployment guide

## Contributing

### Code Style

- TypeScript strict mode, ES2022 target
- ESLint with `typescript-eslint` recommended rules
- Underscore-prefixed unused variables allowed (`_req`)
- Descriptive async method names (`verbNounAsync` optional)

### Commit Messages

Follow conventional commits:
- `feat: add supplier module DTOs`
- `fix: correct unit normalization in certificate parser`
- `chore: update pnpm tooling`

### Pull Requests

PRs should:
- Describe the change and reference `Architecture.md` sections when relevant
- Include testing notes (commands + outcomes)
- Note any schema migrations or new environment variables
- Add screenshots for UI updates

## License

[Add your license here]

---

**Need help?** Check `Architecture.md` for detailed design decisions, or open an issue.
