# Scalable Architecture Plan — AI-Powered Compliance Platform (“CORA” inside)

---

## 1) High-level System Design

**Architecture stance:** Ship as a **modular monolith** first. Each core domain lives in its own package (Nest-style modules or feature folders) with strict interfaces, shared migrations, and one deployment artifact. This preserves transactional consistency, quick end-to-end iteration, and simpler local dev. The API contracts documented below double as future “extraction seams” if scale/team boundaries later warrant microservices (e.g., spinning CORA or Supplier workflows into standalone deployables).

**Core modules inside the monolith:**

* **Gateway/API** (Node.js + TypeScript, Express): Terminates TLS, enforces OAuth/JWT, rate limiting, input validation (zod), and routes requests into internal modules via dependency-injected services. Handles tenant scoping, policy enforcement, and exposes `/healthz`, `/metrics`, `/readyz`. Also houses API versioning and request tracing middleware shared by every module. (Done)
* **Compliance Service**: Owns BOM ingestion (CSV/JSON parsers, subassembly mapping), certificate ingestion (XML/CSV determinism, PDF→CORA fallback), normalization rules, and the merge/status engine powering `/merged`, `/impact/predict`, and risk scoring. Publishes ingestion issues onto the workflow queue when data is missing. Maintains cacheable projections (materialized views) for the dashboard and exposes a typed interface consumed by Risk and Supplier modules. (mostly done)
* **CORA AI Module** (co-located Python FastAPI via sidecar or Node worker): Manages prompt templates, retries/guardrails, JSON schema validation, and LLM provider clients. Exposes an internal RPC interface used by Compliance and Supplier modules (via in-process adapters or HTTP calls to the sidecar). Stores `llm_calls`, prompt hashes, and links outputs to audit logs. Supports temperature/model overrides per tenant and throttles to avoid burst spend. (Done)
* **Risk/Impact Module**: Maintains regulation catalogs, limit sliders, impact simulations, trend caches, and the risk scoring formulas. Consumes Compliance status snapshots (via DB views + cache invalidation events) and exposes scenario diffs with supplier/assembly rollups. Generates pre-computed heatmaps for the dashboard and feeds alerting thresholds into the Jobs module. (Mostly done)
* **Supplier Module**: Manages suppliers, contacts, `component_suppliers`, SLA tracking, request workflows, and integrates with CORA to draft outreach. Owns `/supplier/scorecard`, calculates response KPIs, reconciles inbound responses/webhooks, and triggers escalations. Emits audit events and updates scorecards when requests close or expire; also publishes “slow responder” events for Ops Center widgets.
* **File/Document Module**: Handles uploads (pre-signed URLs), virus scanning hooks, document metadata, storage refs (S3/MinIO), and ties files to BOMs/certificates. Provides document fetch APIs for CORA parsing, manages retention policies, and enforces tenant-level encryption keys. Coordinates with Compliance to stash parsed JSON snapshots. (Done, S3 not tested)
* **Jobs & Workflow Module**: Temporal workers living in the same repo, consuming queues for ingestion retries, supplier reminders, LLM reprocess tasks, and impact simulations. Provides an internal DSL for defining workflows so business logic stays versioned with code. Includes heartbeat monitors and dead-letter handling surfaced to the Ops Center. (Done, stubbed workflows)
* **Search/RAG Module**: Manages embeddings (pgvector/Qdrant), regulation corpora ingestion, and retrieval helpers injected into CORA prompts or dashboard search. Shares the same Postgres connection to reuse tenant scoping, periodically updates embeddings, and exposes semantic search endpoints for compliance texts.

**Inter-module communication:** In-process TypeScript interfaces (or gRPC-like contracts) keep boundaries explicit. Long-running/async work is handed off via Redis/Temporal queues. Shared libraries (auth, logging, tracing) live under `/libs` to avoid circular dependencies.

**Infra (local/dev → prod):**

* **PostgreSQL** (+pgvector)
* **Redis** (queues, cache)
* **Object storage**: S3/minio
* **Docker Compose** for local; optional **Terraform**: VPC, RDS, S3, ECS/EKS, CloudFront/ALB, Secrets Manager.

**Multi-tenancy:** “shared-db, shared-schema”

* Every row has `tenant_id`; enforce Postgres RLS + JWT tenant claims. Feature flags and per-tenant config live in DB.

---

## 2) Data Model (essential tables)

**Tenancy & Auth**

* `tenants(id, name, plan, created_at)`
* `users(id, tenant_id, email, role, oidc_sub, …)`
* `api_keys(id, tenant_id, hashed_key, scope, last_used_at)`

**Products & BOM**

* `products(id, tenant_id, product_name, code)`
* `boms(id, tenant_id, product_id, bom_external_id, uploaded_by, uploaded_at, source_doc_id)`
* `bom_subassemblies(id, tenant_id, bom_id, assembly_id, name, parent_assembly_id null)`
* `bom_components(id, tenant_id, bom_id, assembly_id, part_number, material, weight_g, weight_mg, normalized_weight_mg)`

  * Mirrors the “Industrial Smart Hub v2” hierarchy with SUB-001/002/003 assemblies so dashboards can collapse/expand Control Unit vs Battery Pack views.

**Suppliers**

* `suppliers(id, tenant_id, name, country, language, compliance_rate, response_avg_days)`
* `supplier_contacts(id, supplier_id, email, name)`
* `component_suppliers(id, tenant_id, part_number, supplier_id, sourcing_type)` — establishes who owns each part even when no certificate exists.
* `supplier_requests(id, tenant_id, supplier_id, bom_id, status, sent_at, due_at, last_reminder_at, response_at)`

  * Seed from uploaded suppliers file for scorecards (e.g., response days 7/15/3; languages de/zh/en) and map Control Unit/Battery Pack components to SUP-101/102/103.

**Certificates & Substances**

* `certificates(id, tenant_id, type, supplier_id, part_number, declaration_date, valid_until, threshold_ppm, document_limit_source, source_doc_id)`
* `certificate_findings(id, certificate_id, substance_name, concentration_value, concentration_unit, concentration_ppm, concentration_raw, data_quality)` — capture blank concentrations and flag `"data_quality":"value_missing"`.

  * Example: REACH XML shows Lead 0.09% on CU-78901, Nickel Sulfate 0.05% on WM-88211, and PFOA 0.002% on BP-44001, while RoHS CSV provides per-row thresholds/expiry (950 ppm Lead etc.).
* `documents(id, tenant_id, filename, mime, bytes, storage_url, sha256, uploaded_at, parsed_json)`
* `regulations(id, code, name, region, version, effective_date)`
* `regulation_limits(id, regulation_id, substance, limit_ppm)` (e.g., PFAS sliders for impact sim)
* `audit_logs(id, tenant_id, actor_user_id, action, target, payload_json, created_at)`
* `llm_calls(id, tenant_id, agent, prompt_hash, input_json, output_json, model, latency_ms, created_at)`

**Indexes (examples):**

* `bom_components(tenant_id, bom_id, part_number)`
* `certificate_findings(substance_name, concentration_ppm)`
* `certificates(part_number, valid_until)`
* `supplier_requests(supplier_id, status, due_at)`
* `component_suppliers(tenant_id, part_number, supplier_id)`

**Materialized views**

* `v_compliance_status` — left join `bom_components`/`bom_subassemblies` with most-recent valid `certificates` by `part_number`; compute status: `COMPLIANT | MISSING | EXPIRED | OVER_LIMIT` and expose `assembly_id` for filters.

---

## 3) API Surface (TypeScript DTOs, zod validation)

**POST** `/bom/upload`

* Multipart file or JSON. Accepts CSV/JSON (and ZIP of subdocs).
* Parses hierarchical assemblies → `bom_subassemblies` + `bom_components`, normalizes weights: `ppm = (mg/kg)*1000`, `% → ppm * 10,000`, handles missing units (null + flag).
* Returns `{bom_id, components_count, assemblies: number, issues:[…]}`; issues include missing supplier mappings or null weights so CORA can request data.
* Example components reflect Control Unit/Wireless Module/Battery Pack.

**POST** `/certs/upload`

* Accepts CSV/XML/PDF. XML/CSV use deterministic parsers; PDFs go to CORA AI.
* Normalizes all concentrations to ppm and persists per-row thresholds/expiry where provided (RoHS CSV columns).
* Stores doc + extracted `certificate_findings`, marking `data_quality` when concentrations are blank (e.g., Antimony row) so supplier workflows trigger automatically.

**GET** `/merged?bom_id=…`

* Returns BOM components with assembly context, supplier ownership (`component_suppliers`), and latest findings/status, e.g., CU-78901 has Lead finding 0.09% (=900 ppm).

**GET** `/supplier/scorecard?supplier_id=…`

* Returns responsiveness, last request dates, compliance rate (e.g., 0.91/0.65/0.98), plus outstanding parts mapped to the supplier that lack valid certificates so ops knows which BOM assemblies are blocked.

**POST** `/impact/predict`

* Body: `{ regulation: "PFAS", new_limit_ppm: 100, bom_id?: string }`
* Computes which parts flip from compliant→over-limit given the new threshold using baseline document thresholds; returns deltas plus counts per supplier and assembly so PFAS slider changes show who is impacted.

**POST** `/ai/parse-document` (CORA)

* Body: `{ document_id, schema: "certificate_v1" }` → structured JSON, validation report, and audit record.

**POST** `/ai/supplier-email`

* Body: `{ supplier_id, bom_id, language?, tone? }` → subject, body, localized; logs to `llm_calls`.

**POST** `/ai/risk-summary`

* Body: `{ product_id | bom_id }` → overall risk %, top 3 supplier gaps, upcoming expirations.

---

## 4) CORA — AI & Prompt Engineering

**Runtime choices:** Python FastAPI (pydantic for strict JSON), or Node + TypeScript (Zod). Use function-calling or JSON schema mode with retry/repair (jsonschema + partial fix).

**Guardrails:**

* Deterministic schema (`certificate_v1`) + `ajv`/`pydantic` validation.
* Automatic unit normalization + value ranges.
* Redact emails/PII in prompts; store prompt hashes, not raw content in prod logs.

### Prompt 1 — **AI Document Parsing** (PDF/SDS/CoC → JSON)

*System Prompt (excerpt):*

> You are an expert compliance analyst. Extract **part_number**, **substance_name**, **concentration_value**, **concentration_unit** from the provided certificate. Normalize to **ppm** when possible and also return the raw unit/value. If conflicting data is present, return **multiple findings** per part. Output strictly in the provided JSON schema. If a unit is missing, set `concentration_unit: null` and `notes: "unit_missing"` and do not hallucinate. Prefer tables; if free-text, capture ranges as `value_low/value_high`.
>
> 1. Restate the input doc type and fields detected.
> 2. List any ambiguities or missing values before producing JSON.
> 3. Produce the JSON output only after the checks pass; if validation fails, explain the fix and retry.

*Tools/Context:*

* Provide few-shot examples from our XML/CSV content (no PII), e.g., Lead 0.09% on CU-78901 → 900 ppm; Nickel Sulfate 0.05% on WM-88211 → 500 ppm; PFOA 0.002% on BP-44001 → 20 ppm.

*Output (schema head):*

```json
{
  "doc_ref": "string",
  "parts": [
    {
      "part_number": "string",
      "findings": [
        {
          "substance_name": "string",
          "concentration_value": number,
          "concentration_unit": "%|ppm|mg/kg|null",
          "concentration_ppm": number|null,
          "notes": "string|null"
        }
      ]
    }
  ]
}
```

### Prompt 2 — **Supplier Email Generator**

*System Prompt (template):*

> Draft a concise, professional email to **{supplier_name}** requesting updated **RoHS** and **REACH** certificates for BOM **{bom_external_id}**. Localize to **{language}** (default English) with country-appropriate salutations, and cite the nearest regulatory deadline if a certificate expires within 90 days. Include a bullet list of missing parts and documents, a secure upload link, and a clear due date based on the supplier’s **average response time** (+2 days buffer). Keep it under 180 words and avoid legal advice.
>
> Reasoning plan:
>
> - Step 1: Summarize missing findings/threshold breaches grouped by assembly.
> - Step 2: Compute due date = `now + avg_response_days + 2`.
> - Step 3: Draft the localized email referencing the summary and due date.

*Context:*

* Supplier metadata (e.g., Zentech Components (de), Jinlong Precision (zh), EverBright (en); avg response 7/15/3 days, last request dates).

### Prompt 3 — **Risk Summarization Bot**

*System Prompt (template):*

> Summarize compliance risk for **{product_name}**. Prioritize:
>
> 1. Findings above limits, 2) Missing/expired certs, 3) Substances affected by recent or proposed changes. Give the **top 3 supplier gaps** with short actions and ETAs (based on responsiveness). Include a 1-line exec summary with traffic-light color (text).
>
> Before writing the summary, list the calculations performed (affected assemblies, supplier lag) and reference which dataset (BOM, certificates, supplier stats) supports each conclusion.

*Context:*

* Merged status for BOM (e.g., CU-78901 has Lead finding, WM-88211 has Nickel Sulfate finding, BP-44001 shows PFOA).
* Product “Industrial Smart Hub v2” BOM for part list.

**RAG (bonus):**

* Ingest regulation PDFs to `regulations` + `regulations_embeddings`.
* Retrieval → add snippet citations into prompts (model sees text; we store link/section).

**Temporal workflows (bonus):**

* `SupplierRequestWorkflow(bom_id, supplier_id)`:

  * Step 1: Draft email (CORA) → send → wait `avg_days` → check inbox/webhook → if no response, escalate, open ticket, schedule call → SLA outcome written to scorecard.
  * Steps are resilient (retries, backoff, compensation).

---

## 5) Compliance Logic & Normalization

**Units:**

* `% → ppm = % * 10,000`
* `mg/kg → ppm = mg/kg` (1:1)
* Fallback: if unit unknown → `concentration_ppm = null`, flag in `notes`.
* If `concentration_value` is blank (e.g., Antimony row), keep the record, set `data_quality = "value_missing"`, and file an ingestion issue tied to the supplier request workflow.

**Status engine per component:**

```
if no certificate: MISSING
else if now() > valid_until: EXPIRED
else if any finding.concentration_ppm > regulation_limit_ppm(substance): OVER_LIMIT
else: COMPLIANT
```

* Example inputs from REACH XML drive CU-78901/WM-88211/BP-44001 test cases; RoHS CSV thresholds override regulation defaults when present.

**Impact simulator (/impact/predict):**

* Input new threshold(s) (e.g., PFAS limit drops by 90%).
* Re-evaluate `OVER_LIMIT` with new limits (vector of substances) using document-specific thresholds as the baseline when present; return counts, affected suppliers, assemblies, and parts heatmap.
* Frontend slider updates instantly; server computes and caches diffs.

**Risk score (0–100):**

* `w1 * over_limit_parts + w2 * missing/expired + w3 * time_to_expiry + w4 * supplier_risk`
* Supplier risk uses `1 - compliance_rate` and `response_avg_days` (normalize 0–1).

---

## 6) Frontend (Next.js + React + Tailwind)

**Pages/Sections:**

* **BOM & Compliance Explorer**: Virtualized grid (TanStack Table) with server-side pagination; filters by status/substance/supplier.
* **Supplier Scorecards**: SLA trend sparkline, avg response, compliance rate, open requests.
* **Risk Visualization**: Framework % donut, trend line, supplier bubble chart.
* **Impact Simulator**: Controls: regulation selector, limit sliders, “Apply” → diff table; scenario save/share.
* **Audit & LLM Logs**: Prompt/response metadata (hashed prompt), latency, outcome.
* **Ingestion Ops Center**: Stream of BOM/cert upload issues (missing suppliers, blank concentrations) with retry buttons and supplier auto-trigger statuses.
* **Supplier SLA Monitor**: Leaderboard of slow responders vs SLA target, highlighting workflow escalations.

**Components:**

* Virtual list for thousands of rows.
* Recharts for charts.
* i18n for email previews (de/zh/en).
* Role-based UI (viewer, analyst, admin) gating Ops Center/SLA monitors.

---

## 7) Security, Privacy, Monitoring

**AuthN/Z:** OAuth2.1 + PKCE (Auth0/WorkOS/DIY), JWT with `tenant_id`, `roles`. The gateway validates every request via `Authorization: Bearer <token>` (no more `X-Tenant-Id` escape hatch) using either a remote JWKS (`AUTH_JWKS_URL`) or an HMAC fallback (`AUTH_JWT_SECRET`) plus issuer/audience guards (`AUTH_ISSUER`, `AUTH_AUDIENCE`). Tokens must include `tenant_id`, `roles`, and optional `email` claims; these propagate into an AsyncLocalStorage-backed tenant context so every Postgres query automatically executes with `set_config('app.current_*', …)` before hitting the RLS-protected tables.

**Row-Level Security:** `infra/db/migrations/003_rls_policies.sql` enables+forces RLS across every tenant-owned table/view, adds helper functions (`app_private.current_tenant`, `app_private.roles`, `app_private.bypass_rls`), and seeds deterministic policies for join tables (supplier contacts, certificate findings, regulation embeddings). Background scripts or data loads toggle `app.bypass_rls` explicitly when cross-tenant access is required.

**Secrets:** AWS Secrets Manager/SSM; no LLM keys in client.

**Auditability:** Every upload, LLM call, and supplier status change → `audit_logs`. Persist model, temperature, input hash, output hash.

**Observability:** OpenTelemetry traces + logs; SLOs: p95 latency, LLM latency, parser success rate, supplier response SLA.

* Surfaced directly into the Ops Center dashboard via alert streams for ingestion failures (missing values, supplier mapping gaps) and slow-supplier queues (Temporal workflow lag > SLA).

**Data protection:** Signed URLs, object-level encryption, AV scan, PII redaction in prompts.

---

## 8) Deployment

**Docker Compose (dev):** api, ai, worker, db, redis, minio, temporal.

**Terraform (optional prod):** VPC, RDS Postgres (pgvector), ElastiCache Redis, S3, EKS/ECS, ALB, CloudFront, IAM least-privilege, WAF.

---

## 9) Implementation Milestones (2–3 week track)

1. **Scaffold & Auth** (API + Next.js, JWT, RLS)
2. **BOM Upload & Parser** (+unit normalization, Explorer UI)
3. **Cert Uploads** (XML/CSV deterministic; PDF → CORA v1)
4. **Merge & Status Engine** (+risk score, dashboards)
5. **Supplier Scorecards & Workflows** (emails, reminders)
6. **Impact Simulator** (PFAS & general thresholds)
7. **Observability & Audits** (LLM logs, alerts)
8. **RAG + Temporal (bonus)**

---

## 10) Thin API Contracts (concise examples)

```ts
// /bom/upload (response)
{ bom_id: string; assemblies: number; components: number; issues: {code:string; msg:string}[] }

// /certs/upload (response)
{ certificate_id: string; findings: number; expires: string | null }

// /merged (response)
{
  bom_id: string;
  items: Array<{
    part_number: string;
    assembly_id: string;
    supplier_id?: string | null;
    material?: string | null;
    findings?: Array<{ substance: string; ppm: number }>;
    status: "COMPLIANT" | "MISSING" | "EXPIRED" | "OVER_LIMIT";
    valid_until?: string | null;
  }>;
}

// /supplier/scorecard (response)
{
  supplier: { id:string; name:string; country:string; language:string; compliance_rate:number; response_avg_days:number };
  requests_open: number;
  avg_response_days: number;
  last_request?: string | null;
  blocked_parts: Array<{ part_number:string; assembly_id:string; reason:"MISSING"|"VALUE_MISSING"|"OVER_LIMIT" }>;
}

// /impact/predict (response)
{
  regulation: string;
  old_limit_ppm: number;
  new_limit_ppm: number;
  summary: { affected_parts: number; affected_suppliers: number; affected_assemblies: number };
  deltas: Array<{ part_number:string; before:"COMPLIANT"|"OVER_LIMIT"; after:"COMPLIANT"|"OVER_LIMIT" }>;
}
```

---

## 11) “Good” Prompts (ready to paste)

**A) Document Parsing (to JSON)**

> You are an expert compliance analyst. Given this product’s SDS/CoC/certificate, extract a list of **part_numbers**, **substances**, **concentration values**, and **units**.
> **Rules:**
>
> * Output strictly in the provided JSON schema.
> * Also compute `concentration_ppm` ( `% * 10000`; `mg/kg` = `ppm`; otherwise `null`).
> * If units are missing or ambiguous, don’t guess—set `concentration_unit: null` and `notes: "unit_missing"`.
> * If multiple values exist for the same part/substance, include all as separate findings with `notes`.
> * Include `valid_until` and `declaration_date` if present.
> * Do not include any text outside JSON.
> * Think aloud: first list detected tables/fields, then describe validation fixes, finally emit JSON.

**B) Supplier Email Generator**

> Draft a professional email in **{language}** to **{supplier_name}** requesting updated **RoHS** and **REACH** certificates for BOM **{bom_external_id}**.
> Include:
>
> * The list of **missing/expiring** certs (bulleted) with part numbers.
> * A secure upload URL and a **due date** of **{due_date}** (based on your average response time).
> * A brief reminder of relevant regulatory expectations.
>   Limit to ~150–180 words; polite, actionable, no legal advice.
> * Outline the plan (missing data summary → due date calculation → email) before the final draft.

**C) Risk Report**

> Summarize overall compliance risk for **{product_name}**.
>
> * Call out: over-limit findings, missing/expired certificates, and substances sensitive to upcoming thresholds (e.g., PFAS).
> * List **top 3 supplier gaps** with proposed actions and estimated ETAs based on responsiveness.
> * End with a one-line “traffic light” status (Green/Amber/Red) and rationale.
> * Prepend a numbered list of the calculations you used (e.g., thresholds breached, assemblies affected, supplier lag) so reviewers can trace the reasoning.

---

## 12) What you can test immediately with the sample data

* **/bom/upload** → load “Industrial Smart Hub v2” and confirm components present.
* **/certs/upload** (XML) → verify findings for Lead/Nickel Sulfate/PFOA and `valid_until`.
* **/merged** → see statuses per part; CU-78901/WM-88211/BP-44001 should anchor your test cases.
* **/supplier/scorecard** → confirm responsiveness and compliance rates (7/15/3 days; 0.91/0.65/0.98).
* **/impact/predict** → set PFAS limit drop and watch BP-44001 behavior change in the diff (depending on your seeded limits).
* **Supplier mapping sanity** → ensure each part in the BOM links back to SUP-101/102/103 so CORA emails and SLA monitors know which supplier to ping when certificates are missing.

---
