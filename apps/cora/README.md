# CORA Sidecar

Python FastAPI service responsible for LLM orchestration (document parsing, supplier outreach, risk summaries). Packaged as a sidecar so AI dependencies stay isolated yet versioned with the repo, per **Architecture.md §4**.

## Responsibilities
- Host prompt templates + schema enforcement (Pydantic guardrails + JSON mode).
- Provide `/ai/parse-document`, `/ai/supplier-email`, `/ai/risk-summary` internal endpoints.
- Log `llm_calls` with prompt hashes plus audit log entries, matching the Postgres schema.
- Integrate with pgvector/Qdrant for RAG retrieval when available (stubbed hook).

## Running locally

```bash
cd apps/cora
uv run cora  # or `uv run cora --reload` for dev
```

Required environment variables (prefix `CORA_`):

| Variable | Description |
| --- | --- |
| `CORA_DATABASE_URL` | Postgres connection string with access to the shared multi-tenant schema |
| `CORA_OPENAI_API_KEY` | OpenAI token used for gpt-4o style function-calling |
| `CORA_OPENAI_MODEL` | Optional override (defaults to `gpt-4o-mini`) |
| `CORA_OPENAI_TEMPERATURE` | Default temperature (default `0`) |
| `CORA_SAMPLE_DATA_DIR` | (Optional) Absolute path to Sample Data for `s3://sample/*` fallbacks |
| `CORA_STORAGE_S3_ENDPOINT_URL` | (Optional) Custom endpoint for S3-compatible stores (e.g., MinIO) |
| `CORA_STORAGE_S3_REGION` | (Optional) AWS region override for the S3 client |

Use `X-Tenant-Id` header on requests so the service can scope database access + logging.

Health probe: `GET /healthz`  
AI endpoints mounted under `/ai/*`.
