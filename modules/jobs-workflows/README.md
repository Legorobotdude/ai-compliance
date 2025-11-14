# Jobs & Workflows Module

Defines workflow specs, activities, and queue consumers shared by the worker application (Architecture.md §1 “Jobs & Workflow Module” and §211 “SupplierRequestWorkflow”).

- Temporal workflow definitions (supplier request orchestration, ingestion retries, future impact recompute flows).
- Queue adapters, retry policies, and dead-letter handling reusable by every module that needs async processing.
- Observability hooks (workflow_events, audit logs, structured metrics) surfaced to the Ops Center dashboards.

## Prerequisites

1. Run a Temporal cluster locally (Temporal CLI `temporal server start-dev` or Docker Compose). The worker/API default to `localhost:7233` / namespace `default` to match the Temporal “Run your first program” TypeScript tutorial.
2. Configure the env vars listed in `.dev.env.example` (`TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_SUPPLIER_TASK_QUEUE`, `TEMPORAL_INGESTION_TASK_QUEUE`). Keep these synchronized across the API and worker so they talk to the same queues.
3. `pnpm install && pnpm build` so the shared module emits JS for the worker runtime.

## Workflows & Activities

| Workflow | Description | Key Activities |
| --- | --- | --- |
| `supplierRequestWorkflow` | Drives the Supplier escalation cadence (email send → wait until due date → response check → escalation → completion). Mirrors Architecture.md §211. | `logQueued`, `dispatchInitialRequest`, `checkForResponse`, `escalateRequest`, `finalizeRequest` |
| `ingestionRetryWorkflow` | Placeholder pipeline for ingestion issues emitted by Compliance (Architecture.md §3). | `markIssueQueued`, `performRetry`, `resolveIssue` |

Shared activities live under `src/activities/*` and use `WorkflowRepository` for persistence so everything stays transactional with the main Postgres schema.

### Known stubs / follow-ups

- `performRetry` activity is a stub; wire it to the Compliance ingestion pipelines so retries reprocess BOM/certificate issues (Architecture.md §3).
- No Temporal Schedules/Nexus jobs yet—currently everything is API-triggered. Add periodic schedules/backfills for ingestion + supplier cadences as the Ops Center evolves.
- Impact simulation workflows mentioned in Architecture.md §1 are not implemented yet; add dedicated workflows + activities once Risk module triggers are ready.
- Signals beyond the state query (`supplierRequestWorkflowState`) are missing; add manual escalation/cancel signals and richer queries for Ops Center dashboards.
- Worker versioning/build IDs are not configured; introduce Temporal worker versioning before production deployments.
- `scripts/temporal-smoke.mjs` only covers the supplier workflow path today; add ingestion/impact coverage once those flows are functional.

## Running the worker locally

```bash
pnpm dev                 # runs API, web, CORA, and the Temporal worker via scripts/dev.sh
# or start just the worker for debugging
pnpm --filter @certivo/worker dev
```

The worker bootstraps both task queues (supplier + ingestion). The API automatically instantiates a Temporal client on startup so calls to `/supplier/request` schedule workflows immediately.

## References

- Architecture.md §§1, 211
- Temporal TypeScript “First program” tutorial: https://learn.temporal.io/getting_started/typescript/first_program_in_typescript/
