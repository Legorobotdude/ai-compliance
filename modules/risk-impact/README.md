# Risk & Impact Module

Contains regulation catalogs, risk scoring logic, and what-if simulation engines.

- CRUD + caching for regulations/limits, including pgvector search indexes.
- Delta calculators comparing baseline vs scenario thresholds (supplier + assembly rollups).
- Risk scoring utilities combining compliance, supplier, and expiry weights.
- Exposes APIs/handlers for `/impact/predict` and risk dashboards.
