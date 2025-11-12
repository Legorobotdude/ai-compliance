# Search & RAG Module

Provides semantic search and retrieval augmentation for regulations, supplier docs, and historical findings.

- Pipelines to ingest PDFs/HTML into pgvector or Qdrant.
- Query interfaces used by CORA prompts and dashboard search bars.
- Caching + access controls so tenants only see their own corpora.
