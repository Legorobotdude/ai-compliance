import type { SearchQuery, DocumentIngestRequest, SearchContext } from '../dtos/search-dtos.js';
import { SearchService } from '../services/search-service.js';

export class SearchController {
  constructor(private readonly service: SearchService) {}

  search(payload: SearchQuery) {
    return this.service.queryRegulations(payload);
  }

  ingestDocument(payload: DocumentIngestRequest) {
    return this.service.ingestDocument(payload);
  }

  buildPromptContext(payload: SearchQuery & { conversationId?: string }): Promise<SearchContext> {
    return this.service.buildPromptContext(payload as SearchQuery & { conversationId?: string });
  }
}
