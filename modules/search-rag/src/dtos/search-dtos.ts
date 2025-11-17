import type { TenantID, UUID } from '@certivo/lib-db';

export type RagSourceType = 'DOCUMENT' | 'REGULATION' | 'NOTE';

export interface SearchQuery {
  tenantId: TenantID;
  query: string;
  topK?: number;
  filters?: SearchFilters;
  useVector?: boolean;
}

export interface SearchFilters {
  sourceTypes?: RagSourceType[];
  documentIds?: UUID[];
  sourceKeys?: string[];
  minScore?: number;
}

export interface SearchResultChunk {
  id: string;
  documentId: UUID;
  documentTitle: string;
  sourceKey: string;
  sourceType: RagSourceType;
  score: number;
  content: string;
  chunkIndex: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentIngestRequest {
  tenantId: TenantID;
  sourceKey: string;
  title: string;
  content: string;
  description?: string;
  sourceDocumentId?: UUID;
  regulationId?: UUID;
  sourceUrl?: string;
  sourceType?: RagSourceType;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentIngestResponse {
  documentId: UUID;
  checksum: string;
  chunkCount: number;
  tokenCount: number;
}

export interface SearchContext {
  contextId: UUID;
  query: string;
  results: SearchResultChunk[];
}
