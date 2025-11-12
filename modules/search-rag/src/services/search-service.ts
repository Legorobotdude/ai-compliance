import type { SearchQuery, SearchResultChunk } from '../dtos/search-dtos';
import { SearchRepository } from '../repositories/search-repository';

export class SearchService {
  constructor(private readonly repository: SearchRepository) {}

  async queryRegulations(request: SearchQuery): Promise<SearchResultChunk[]> {
    const topK = request.topK ?? 5;
    return this.repository.searchRegulations(request.tenantId, request.query, topK);
  }
}
