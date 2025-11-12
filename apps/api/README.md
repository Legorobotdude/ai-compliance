# API Application

Node.js + TypeScript Express server that hosts the modular monolith. It wires up Gateway routing, composes domain modules (Compliance, Supplier, Risk/Impact, File/Document, Search/RAG), and exposes REST + internal RPC endpoints. All module dependencies are injected here.

## Responsibilities
- Bootstrap config, logging, metrics, and multi-tenant auth middleware.
- Register HTTP routes per module (e.g., `/bom/upload`, `/supplier/scorecard`).
- Expose healthz/metrics/readyz endpoints for infra probes.
- Publish domain events to the Jobs & Workflow module via Redis/Temporal.
