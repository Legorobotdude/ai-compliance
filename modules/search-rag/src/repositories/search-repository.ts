import type { DatabaseClient, TenantID } from '@certivo/lib-db';
import type { SearchResultChunk } from '../dtos/search-dtos';

export class SearchRepository {
  constructor(private readonly db: DatabaseClient) {}

  async searchRegulations(tenantId: TenantID, query: string, topK: number): Promise<SearchResultChunk[]> {
    return this.db.query<SearchResultChunk>({
      text: `select id, score, content, source_url as "sourceUrl"
             from regulation_embeddings.search($1, $2, $3)` ,
      values: [tenantId, query, topK]
    });
  }
}
