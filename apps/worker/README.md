# Worker Application

Node.js worker hosting Temporal/BullMQ workflows. Executes ingestion retries, supplier reminder cadences, impact simulations, and background CORA repair jobs.

## Responsibilities
- Register workflows/activities versioned with application code.
- Consume ingestion issue queues and trigger Supplier module actions.
- Emit heartbeat/metrics for Ops Center dashboards.
- Provide CLI entry points for backfills and one-off reprocessing.
