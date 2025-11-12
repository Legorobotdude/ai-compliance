import type { TenantID } from '@certivo/lib-db';

export interface SearchQuery {
  tenantId: TenantID;
  query: string;
  topK?: number;
}

export interface SearchResultChunk {
  id: string;
  score: number;
  content: string;
  sourceUrl?: string;
}
