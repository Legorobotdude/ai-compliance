import { randomUUID } from 'node:crypto';
import type { DatabaseClient, TenantID, UUID } from '@certivo/lib-db';
import type { DocumentIngestRequest, SearchFilters, SearchResultChunk } from '../dtos/search-dtos.js';

interface RagDocumentRow {
  id: UUID;
}

interface ChunkInsert {
  id: UUID;
  tenantId: TenantID;
  documentId: UUID;
  regulationId?: UUID | null;
  content: string;
  sourceUrl?: string | null;
  embeddingSql: string;
  metadata?: Record<string, unknown> | null;
  chunkIndex: number;
  tokenCount: number;
  citationLabel?: string | null;
}

interface QueryLogInput {
  tenantId: TenantID;
  query: string;
  topK: number;
  filters?: SearchFilters;
  resultIds: UUID[];
  conversationId?: UUID;
}

export class SearchRepository {
  constructor(private readonly db: DatabaseClient) {}

  async upsertDocument(payload: DocumentIngestRequest & { checksum: string; tokenCount: number; chunkCount: number }): Promise<RagDocumentRow> {
    const values = [
      payload.tenantId,
      payload.sourceKey,
      payload.title,
      payload.description ?? null,
      payload.sourceDocumentId ?? null,
      payload.regulationId ?? null,
      payload.sourceType ?? 'DOCUMENT',
      payload.language ?? null,
      payload.sourceUrl ?? null,
      payload.checksum,
      payload.tokenCount,
      payload.chunkCount,
      JSON.stringify(payload.metadata ?? {}),
      new Date().toISOString()
    ];
    const rows = await this.db.query<RagDocumentRow>({
      text: `insert into regulation_embeddings.documents
             (tenant_id, source_key, title, description, source_document_id, regulation_id, source_type, language,
              source_url, checksum, token_count, chunk_count, status, metadata, indexed_at, last_error)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'READY', $13::jsonb, $14, null)
             on conflict (tenant_id, source_key)
             do update set
               title = excluded.title,
               description = excluded.description,
               source_document_id = excluded.source_document_id,
               regulation_id = excluded.regulation_id,
               source_type = excluded.source_type,
               language = excluded.language,
               source_url = excluded.source_url,
               checksum = excluded.checksum,
               token_count = excluded.token_count,
               chunk_count = excluded.chunk_count,
               status = excluded.status,
               metadata = excluded.metadata,
               indexed_at = excluded.indexed_at,
               last_error = null
             returning id`,
      values
    });
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to upsert RAG document row');
    }
    return row;
  }

  async replaceChunks(documentId: UUID, tenantId: TenantID, chunks: ChunkInsert[]): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      await tx.query({
        text: 'delete from regulation_embeddings.chunks where tenant_id = $1 and document_id = $2',
        values: [tenantId, documentId]
      });
      if (!chunks.length) {
        return;
      }
      const columnsPerRow = 11;
      const values: unknown[] = [];
      const placeholders = chunks.map((chunk, index) => {
        const base = index * columnsPerRow;
        values.push(
          chunk.id ?? randomUUID(),
          chunk.tenantId,
          chunk.documentId,
          chunk.regulationId ?? null,
          chunk.content,
          chunk.sourceUrl ?? null,
          chunk.embeddingSql,
          JSON.stringify(chunk.metadata ?? {}),
          chunk.chunkIndex,
          chunk.tokenCount,
          chunk.citationLabel ?? null
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::vector, $${base + 8}::jsonb, $${base + 9}, $${base + 10}, $${base + 11})`;
      });

      await tx.query({
        text: `insert into regulation_embeddings.chunks
               (id, tenant_id, document_id, regulation_id, content, source_url, embedding, metadata, chunk_index, token_count, citation_label)
               values ${placeholders.join(',')}`,
        values
      });
    });
  }

  async searchCorpus(
    tenantId: TenantID,
    query: string,
    topK: number,
    embeddingSql: string | null,
    filters?: SearchFilters
  ): Promise<SearchResultChunk[]> {
    const [vectorParam, filterParam] = [embeddingSql, JSON.stringify(filters ?? {})];
    return this.db.query<SearchResultChunk>({
      text: `select id,
                    document_id as "documentId",
                    document_title as "documentTitle",
                    source_key as "sourceKey",
                    source_type as "sourceType",
                    source_url as "sourceUrl",
                    score,
                    content,
                    chunk_index as "chunkIndex",
                    metadata
             from regulation_embeddings.search($1::uuid, $2, $3, $4::vector, $5::jsonb)` ,
      values: [tenantId, query, topK, vectorParam, filterParam]
    });
  }

  async logQuery(payload: QueryLogInput): Promise<UUID> {
    const rows = await this.db.query<{ id: UUID }>({
      text: `insert into regulation_embeddings.queries
             (tenant_id, query, top_k, filters, result_ids, conversation_id)
             values ($1, $2, $3, $4::jsonb, $5::uuid[], $6)
             returning id`,
      values: [
        payload.tenantId,
        payload.query,
        payload.topK,
        JSON.stringify(payload.filters ?? {}),
        payload.resultIds,
        payload.conversationId ?? null
      ]
    });
    const row = rows[0];
    if (!row) {
      throw new Error('Failed to log RAG query');
    }
    return row.id;
  }
}
