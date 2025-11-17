# Search & RAG Module

Semantic retrieval layer described in Architecture.md §§1 & 4. Owns the pipelines that ingest regulation corpora, supplier uploads, and CORA notes, transforms them into pgvector-backed chunks, and exposes query interfaces to the Express gateway, dashboard, and CORA sidecar.

## Data model

- `regulation_embeddings.documents` tracks each ingestible artifact with tenant scoping, provenance (`source_key`, `source_document_id`, `regulation_id`), lifecycle status, token counts, and metadata.
- `regulation_embeddings.chunks` stores normalized snippets (≈500–800 tokens) plus pgvector embeddings, tsquery projections, and citation labels so downstream consumers can reference specific passages.
- `regulation_embeddings.queries` logs every retrieval request (search, prompt-context build, chat tool calls) for auditability and replay.

See `infra/db/migrations/005_search_rag.sql` for schema details and the pgvector scoring function used by `regulation_embeddings.search`.

## Module responsibilities

- **Ingestion:** `SearchService.ingestDocument` chunks normalized text via `DocumentChunker`, computes deterministic embeddings (`DeterministicEmbeddingGenerator`), and replaces document chunks transactionally. Inputs arrive from compliance/file modules or the CLI (see smoke test below).
- **Retrieval:** `SearchRepository.searchCorpus` calls the SQL helper with query text + optional embeddings/filters. Results include document metadata, scores, and chunk indices for deterministic ordering.
- **Prompt context:** `SearchService.buildPromptContext` wraps retrieval + query logging so ApiController can hand context over to CORA (`/ai/chat`) with traceable chunk IDs/citations.

## API surface

| Route | Method | Description |
|-------|--------|-------------|
| `/rag/documents` | `POST` | Ingest raw text (`sourceKey`, `title`, `content`, optional metadata). Automatically scopes to the caller’s tenant, chunks text, writes embeddings, and returns `documentId`, `tokenCount`, `chunkCount`, `checksum`. |
| `/search` | `GET` | Semantic + keyword retrieval for tenant corpora. Accepts `q` and optional `topK`. |
| `/ai/chat` | `POST` | Conversational endpoint that routes queries through Search/RAG, logs the context bundle, and forwards messages + snippets to CORA for grounded responses with citations. |

All routes are exposed through the Express gateway (see `apps/api/src/main.ts`) and validated via the gateway Zod schemas.

## Document uploads + backfill

- Inline document uploads (`POST /documents` with `dataBase64`) now flow directly into `SearchService.ingestDocument`. The gateway decodes the payload, verifies `sha256`, persists it through the File/Document module, and asynchronously mirrors it into `regulation_embeddings.*` with `sourceKey=document:<uuid>` plus file metadata so CORA/Qwen immediately see tenant documents (Architecture.md §1 + §4).
- Historical artifacts can be indexed by running `node scripts/rag-backfill-documents.mjs`. The script bypasses RLS, finds `documents` without a matching `regulation_embeddings.documents.source_document_id`, loads text from `parsed_json`, `file://` storage, or remote URLs, and runs the same ingestion pipeline. Override `DOCUMENTS_LOCAL_ROOT` or `RAG_BACKFILL_MAX_BYTES` if storage lives elsewhere.

## Local workflow

1. Run migrations + seed data: `pnpm db:migrate && pnpm db:seed`. Seeds include two RAG documents so `/search?q=PFAS` immediately returns hits.
2. Start API + CORA sidecar (`pnpm dev` or `scripts/dev.sh`). Ensure `CERTIVO_API_TOKEN` is set (see `infra/docker/generate-dev-token.mjs`).
3. Use the new CORA chat panel (`apps/web/app/cora/page.tsx`) to exercise `/ai/chat`. Messages are streamed through Search/RAG and display citations/context snippets.

## Smoke test

`node scripts/rag-smoke.mjs` performs a quick integration test:

1. Fetches `/search?q=pfas` to validate seeded corpora.
2. Ingests an ad-hoc document via `/rag/documents`.
3. Re-queries `/search` for a unique token to confirm ingestion succeeded.
4. Calls `/ai/chat` with the custom `sourceKey` filtered so CORA responds with citations referencing the ingested chunks.

The script mirrors the other CLI checks (supplier, risk, lab, etc.) and ensures Search/RAG + CORA chat stay aligned with Architecture.md expectations.
