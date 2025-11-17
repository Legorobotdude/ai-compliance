import { randomUUID } from 'node:crypto';
import type { UUID } from '@certivo/lib-db';
import type {
  DocumentIngestRequest,
  DocumentIngestResponse,
  SearchContext,
  SearchQuery,
  SearchResultChunk
} from '../dtos/search-dtos.js';
import { SearchRepository } from '../repositories/search-repository.js';
import { DocumentChunker } from './document-chunker.js';
import { DeterministicEmbeddingGenerator } from './embedding-generator.js';

export class SearchService {
  constructor(
    private readonly repository: SearchRepository,
    private readonly chunker = new DocumentChunker(),
    private readonly embeddings = new DeterministicEmbeddingGenerator()
  ) {}

  async ingestDocument(request: DocumentIngestRequest): Promise<DocumentIngestResponse> {
    const content = request.content?.trim();
    if (!content) {
      throw new Error('RAG document content cannot be empty');
    }

    const segments = this.chunker.chunk(content);
    const chunkSegments = segments.length ? segments : [{ content, tokenCount: countTokens(content) }];
    const tokenCount = chunkSegments.reduce((total, segment) => total + segment.tokenCount, 0);
    const checksum = this.embeddings.checksum(`${request.sourceKey}:${content}`);

    const documentRow = await this.repository.upsertDocument({
      ...request,
      checksum,
      tokenCount,
      chunkCount: chunkSegments.length
    });

    const chunkPayloads = chunkSegments.map((segment, index) => ({
      id: randomUUID(),
      tenantId: request.tenantId,
      documentId: documentRow.id,
      regulationId: request.regulationId,
      content: segment.content,
      sourceUrl: request.sourceUrl,
      embeddingSql: this.embeddings.toSqlVector(segment.content),
      metadata: {
        ...(request.metadata ?? {}),
        language: request.language ?? null
      },
      chunkIndex: index,
      tokenCount: segment.tokenCount
    }));

    await this.repository.replaceChunks(documentRow.id, request.tenantId, chunkPayloads);

    return {
      documentId: documentRow.id,
      checksum,
      chunkCount: chunkSegments.length,
      tokenCount
    };
  }

  async queryRegulations(request: SearchQuery): Promise<SearchResultChunk[]> {
    const topK = normalizeTopK(request.topK);
    const embeddingSql = request.useVector === false ? null : this.embeddings.toSqlVector(request.query || '');
    return this.repository.searchCorpus(request.tenantId, request.query, topK, embeddingSql, request.filters);
  }

  async buildPromptContext(request: SearchQuery & { conversationId?: UUID }): Promise<SearchContext> {
    const results = await this.queryRegulations({ ...request, useVector: true });
    const resultIds = results.map((chunk) => chunk.id as UUID);
    const contextId = await this.repository.logQuery({
      tenantId: request.tenantId,
      query: request.query,
      topK: normalizeTopK(request.topK),
      filters: request.filters,
      resultIds,
      conversationId: request.conversationId
    });
    return {
      contextId,
      query: request.query,
      results
    };
  }
}

function normalizeTopK(value?: number): number {
  if (!value || value < 1) {
    return 5;
  }
  return Math.min(25, Math.floor(value));
}

function countTokens(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}
