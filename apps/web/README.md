# Web Application

Next.js 14 + Tailwind frontend that renders the Architecture.md §6 dashboard surfaces (BOM Explorer, Supplier Scorecards, Risk viz, Impact Simulator, Audit/LLM feed, Ops Center, SLA monitor) against tenant-scoped APIs.

## Getting started

```bash
pnpm --filter @certivo/web dev     # start the Next.js dev server
pnpm --filter @certivo/web lint    # eslint (flat config shared at repo root)
pnpm --filter @certivo/web typecheck
pnpm --filter @certivo/web build   # production build
```

## Responsibilities

- Implement route groups for dashboards and detail views, mirroring Architecture.md.
- Provide shared UI components (virtualized TanStack Table, Recharts-based viz, localized CORA email previews).
- Integrate with role-aware UI gates (viewer/analyst/admin) plus supplier outreach i18n.
- Handle client telemetry hooks, feature flags, and API wiring in follow-on stories.
