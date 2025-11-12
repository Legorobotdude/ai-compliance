# CORA Sidecar

Python FastAPI service responsible for LLM orchestration (document parsing, supplier emails, risk summaries). Packaged as a sidecar so AI dependencies stay isolated yet versioned with the repo.

## Responsibilities
- Host prompt templates + schema enforcement (pydantic + JSON schema).
- Provide `/ai/parse-document`, `/ai/supplier-email`, `/ai/risk-summary` internal endpoints.
- Log llm_calls with prompt hashes and guardrails metadata.
- Integrate with pgvector/Qdrant for RAG retrieval when available.
