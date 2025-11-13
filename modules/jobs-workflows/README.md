# Jobs & Workflows Module

Defines workflow specs, activities, and queue consumers shared by the worker application.

- Temporal workflow definitions (supplier request, document parsing retries, impact recompute).
- Queue adapters, retry policies, and dead-letter handling.
- Observability hooks (metrics, structured logs) surfaced to Ops Center dashboards.
