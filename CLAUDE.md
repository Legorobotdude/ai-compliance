# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Certivo is an AI-powered compliance platform built as a **modular monolith**. The system manages Bill of Materials (BOM), supplier certificates, compliance status tracking, risk assessment, and AI-powered document parsing through CORA (Compliance Operations & Risk Assistant).

**Architecture Philosophy:** Ship as a modular monolith with strict module boundaries and dependency injection. Each module has explicit interfaces serving as future "extraction seams" for microservices if needed.

## Common Commands

### Development Setup

```bash
# Start infrastructure (Postgres + Redis)
cd infra/docker && docker compose up -d

# Run database migrations
pnpm db:migrate

# Seed sample data (ACME tenant, Industrial Smart Hub v2 BOM, suppliers, certificates)
pnpm db:seed

# Generate JWT token for local development
node infra/docker/generate-dev-token.mjs
```

### Running Applications

```bash
# Start API server (port 4000)
export DATABASE_URL="postgres://certivo:certivo@localhost:5432/certivo"
export AUTH_JWT_SECRET="dev-secret"
export AUTH_ISSUER="https://auth.dev.certivo"
export AUTH_AUDIENCE="certivo-api"
pnpm --filter @certivo/api dev

# Start Next.js web app
export CERTIVO_API_URL="http://localhost:4000"
export CERTIVO_API_TOKEN="<token-from-generate-dev-token>"
pnpm --filter @certivo/web dev

# Build all packages
pnpm build

# Lint all packages
pnpm lint
```

### Module-Specific Commands

```bash
# Build a single module
pnpm --filter @certivo/{module-name} build

# Run module in dev mode
pnpm --filter @certivo/{module-name} dev
```

## Technology Stack

### Backend
- **Node.js + TypeScript** (ES2022, strict mode)
- **Express.js** for REST API
- **PostgreSQL** with pgvector extension (multi-tenant, shared-schema RLS)
- **Redis** for queues and caching (in-dev only)
- **pg** client for raw SQL (no ORM)

### Frontend
- **Next.js 14** (React 18, App Router)
- **Tailwind CSS** for styling
- **TanStack Table** + **TanStack Virtual** for large datasets
- **Recharts** for visualizations

### Validation & Auth
- **Zod** for schema validation
- **Jose** for JWT verification (OAuth2.1, JWKS or HS256)

### Observability
- **Pino** for structured logging (child contexts per request)
- **Prometheus** (prom-client) for metrics

## Architecture & Module Structure

### Repository Structure

```
/apps              → Deployable applications (api, web, worker, cora)
/modules           → Domain modules (compliance, supplier, dashboard, etc.)
/libs              → Cross-cutting libraries (auth, db, logging, tracing)
/infra             → Infrastructure (Docker, Terraform, DB migrations)
/docs              → Architecture decisions and operations guides
/data              → Sample fixtures and payloads
```

### Module Organization Pattern

Every domain module follows this consistent structure:

```
modules/{module-name}/
  src/
    controllers/        # HTTP handler adapters (thin, validation only)
    services/          # Business logic and orchestration
    repositories/      # Data access layer (raw SQL with tenant context)
    dtos/              # Request/response types (Zod schemas)
    validation/        # Input validation schemas
    errors.ts          # Module-specific exceptions
    index.ts           # Public exports (module interface)
  package.json
  tsconfig.json
```

**Layered Dependency Flow:**
- Controller → Service → Repository → Database
- Controllers validate via Zod, call service, return DTO
- Services contain business logic and orchestrate between modules
- Repositories use raw `pg` client with automatic tenant scoping

### Core Modules

- **Gateway** (`@certivo/gateway`): API routing, validation schemas, middleware coordination
- **Compliance** (`@certivo/compliance`): BOM/certificate ingestion, normalization, status engine
- **Dashboard** (`@certivo/dashboard`): Snapshot aggregation, KPI calculations, data projections
- **Supplier** (`@certivo/supplier`): Scorecards, requests, SLA tracking
- **Risk/Impact** (`@certivo/risk-impact`): Regulations, limit sliders, impact simulations
- **File/Document** (`@certivo/file-document`): Uploads, storage refs, metadata
- **Search/RAG** (`@certivo/search-rag`): Embeddings (pgvector), semantic search
- **Jobs/Workflows** (`@certivo/jobs-workflows`): Queue interfaces (currently noop, designed for Temporal/BullMQ)

### Shared Libraries

- **lib-auth** (`@certivo/lib-auth`): JWT verification, tenant extraction
- **lib-db** (`@certivo/lib-db`): Postgres client, tenant context (AsyncLocalStorage), migrations
- **lib-logging** (`@certivo/lib-logging`): Structured logging with Pino
- **lib-tracing** (`@certivo/lib-tracing`): Request correlation IDs

## Multi-Tenancy & Security

### Tenant Context

**Model:** Shared-db, shared-schema with Row-Level Security (RLS)

- Every table has `tenant_id` column
- `AsyncLocalStorage` via `lib-db` sets `app.current_tenant` on each request
- All Postgres queries automatically scope to current tenant
- JWT extracts `tenant_id` from configurable claim (default: `tenant_id`)

### Authentication Flow

1. Middleware validates JWT using JWKS (`AUTH_JWKS_URL`) or HS256 (`AUTH_JWT_SECRET`)
2. Extracts claims: `tenant_id`, `roles`, `email` (configurable claim names)
3. Sets AsyncLocalStorage context for tenant scoping
4. RLS policies enforce tenant isolation at database level

### Row-Level Security

- Enabled on all tenant tables via `003_rls_policies.sql`
- Helper functions: `app_private.current_tenant()`, `app_private.roles()`, `app_private.bypass_rls()`
- Bypass mode for seeding/background jobs (disabled in production)

## Database

### Migration System

- **Location:** `infra/db/migrations/`
- **Runner:** `libs/db/scripts/run-migrations.mjs`
- **Execution:** Run in order on startup, idempotent via `IF NOT EXISTS`

### Key Migrations

1. **001_core_schema.sql**: Core tables (tenants, users, products, boms, components, suppliers, certificates, regulations, audit logs)
2. **002_views_and_functions.sql**: Materialized views (`v_compliance_status`), helper functions
3. **003_rls_policies.sql**: Row-level security policies for all tenant tables

### Important Tables

**BOM Hierarchy:**
- `products` → `boms` → `bom_subassemblies` (hierarchical) → `bom_components`

**Supplier Management:**
- `suppliers` → `supplier_contacts`
- `component_suppliers` (part-to-supplier mapping)
- `supplier_requests` (outreach tracking, SLA)

**Compliance:**
- `certificates` → `certificate_findings` (substance concentrations)
- `regulations` → `regulation_limits`
- `ingestion_issues` (missing data, supplier gaps)

**Observability:**
- `audit_logs` (all user actions)
- `llm_calls` (CORA AI interactions with prompt hashes)

## API Endpoints

### BOM & Compliance

- `POST /bom/upload` — Ingest BOM (CSV/JSON/ZIP), create hierarchical components
- `POST /certs/upload` — Ingest certificates (CSV/XML/PDF), normalize concentrations
- `GET /merged/:bomId` — Fetch BOM with latest certificate status per component

### Supplier Management

- `GET /supplier/scorecard/:supplierId` — Compliance rate, response KPIs, outstanding parts
- `POST /supplier/request` — Create outreach request to supplier

### Risk & Impact

- `POST /impact/predict` — Simulate regulation limit change, return affected parts/suppliers

### Documents

- `POST /documents/upload` — Upload file, store metadata, return ref for CORA parsing
- `GET /documents/:documentId` — Fetch document metadata + parsed JSON

### Search

- `GET /search?q=...&topK=...` — Semantic search (pgvector-backed embeddings)

### Dashboard

- `GET /dashboard/snapshot?bomId=...` — Aggregate: BOM coverage, supplier scorecards, risk, audit, SLA

### System

- `GET /healthz` — Health check (no DB required)
- `GET /readyz` — Readiness check (DB connectivity)
- `GET /metrics` — Prometheus metrics

## Key Implementation Patterns

### Request Flow

1. **Middleware Stack** (in order):
   - JSON parsing (10MB limit)
   - Request context (correlation ID)
   - API version header
   - Prometheus metrics
   - Request logging
   - JWT auth verification
   - Tenant context injection

2. **Controller Layer**:
   - Validate request body via Zod schema
   - Extract tenant context
   - Call service method
   - Transform to DTO
   - Return response

3. **Service Layer**:
   - Business logic and orchestration
   - Inter-module coordination
   - Error handling
   - Audit logging

4. **Repository Layer**:
   - Raw SQL queries with tenant context
   - Transaction management
   - Data transformation

### Compliance Status Engine

```typescript
if (no certificate) return "MISSING"
else if (now() > valid_until) return "EXPIRED"
else if (any finding.concentration_ppm > regulation_limit_ppm) return "OVER_LIMIT"
else return "COMPLIANT"
```

### Unit Normalization

- `% → ppm = % * 10,000`
- `mg/kg → ppm = mg/kg` (1:1)
- Unknown units → `concentration_ppm = null`, flag in `data_quality`
- Missing values → create `ingestion_issues` record

### Logging Patterns

- Structured JSON logs via Pino
- Child loggers per request (include `requestId`, `tenantId`)
- Log levels: trace, debug, info, warn, error, fatal
- All LLM calls logged to `llm_calls` table with prompt hashes

## Environment Variables

### API Server

```bash
PORT=4000                           # Server port
DATABASE_URL=postgres://...         # Postgres connection
AUTH_JWT_SECRET="dev-secret"        # HS256 key (dev only)
AUTH_ISSUER=https://auth.dev.certivo
AUTH_AUDIENCE=certivo-api
AUTH_JWKS_URL=https://...          # JWKS endpoint (prod)
AUTH_TENANT_CLAIM=tenant_id         # JWT claim for tenant
AUTH_ROLES_CLAIM=roles              # JWT claim for roles
AUTH_EMAIL_CLAIM=email              # JWT claim for email
LOG_LEVEL=info                      # Pino level
```

### Web App

```bash
CERTIVO_API_URL=http://localhost:4000
CERTIVO_API_TOKEN=<jwt-token>
```

## Important Implementation Notes

### Compliance Module

- Parses CSV/JSON BOMs → explodes hierarchies → normalizes weights
- Creates `ingestion_issues` for missing suppliers/values
- `ComplianceService.uploadBom()` orchestrates parsing, normalization, DB persistence
- All concentration values normalized to ppm for consistent comparison

### Dashboard Module

- `DashboardService.getSnapshot()` performs in-memory aggregation
- Uses `JOIN` queries + handles NaN/null for compliance calculations
- Aggregates: BOM status, supplier scorecards, risk summaries, audit logs, SLA leaderboards

### Testing Requirements (from user's global CLAUDE.md)

- **No mock services** — Use real database/Redis instances
- Tests must be **comprehensive and reveal flaws** (no useless tests)
- Tests should be **verbose for debugging**
- Don't move to next test until current test is complete
- If test fails, check test structure before refactoring codebase
- Always use the **test-runner sub-agent** to execute and analyze tests

### Code Quality Rules (from user's global CLAUDE.md)

- **No partial implementations** — Complete features only
- **No code duplication** — Check existing codebase, reuse functions
- **No dead code** — Use it or delete it completely
- **No inconsistent naming** — Read existing patterns first
- **No over-engineering** — Simple functions over abstractions
- **No mixed concerns** — Validation in DTOs, not services; queries in repositories, not controllers
- **No resource leaks** — Close connections, clear timeouts, remove listeners

## Sample Data

The `pnpm db:seed` command creates:

- **Tenant:** ACME Corporation (deterministic ID)
- **Product:** Industrial Smart Hub v2
- **BOM:** Hierarchical structure with Control Unit, Wireless Module, Battery Pack assemblies
- **Suppliers:** Zentech Components (de, 7 days avg), Jinlong Precision (zh, 15 days), EverBright (en, 3 days)
- **Certificates:** ROHS and REACH certificates with substance findings
- **Regulations:** PFAS, RoHS, REACH with limits

### Example Test Cases

- **CU-78901** (Control Unit): Lead finding 0.09% (900 ppm)
- **WM-88211** (Wireless Module): Nickel Sulfate finding 0.05% (500 ppm)
- **BP-44001** (Battery Pack): PFOA finding 0.002% (20 ppm)

## Naming Conventions

- **Services:** `{Module}Service` (e.g., `ComplianceService`, `DashboardService`)
- **Repositories:** `{Module}Repository` (e.g., `ComplianceRepository`)
- **Controllers:** `{module}-controller.ts` (e.g., `compliance-controller.ts`)
- **DTOs:** `{module}-dtos.ts` with Zod schemas
- **Errors:** Module-specific error classes in `errors.ts`

## Development Workflow Tips

1. **Always check existing code** before writing new functions
2. **Use sub-agents** for context optimization:
   - `file-analyzer` for reading files
   - `code-analyzer` for searching/analyzing code
   - `test-runner` for executing tests
3. **Read module structure** to understand patterns before implementing
4. **Check tenant context** is properly set in all database operations
5. **Validate with Zod** at API boundaries, not in business logic
6. **Log with context** using child loggers per request
7. **Handle errors explicitly** with module-specific error types

## Future Extensibility

- **CORA AI Module:** Python FastAPI sidecar for LLM operations (document parsing, email generation, risk summaries)
- **Temporal Workflows:** Supplier request workflows with reminders and escalations
- **RAG Integration:** pgvector-backed semantic search for regulations
- **Microservices Extraction:** Module interfaces serve as "extraction seams" for future scaling
