import type { SearchQuery } from '../dtos/search-dtos';
import { SearchService } from '../services/search-service';

export class SearchController {
  constructor(private readonly service: SearchService) {}

  async search(payload: SearchQuery) {
    return this.service.queryRegulations(payload);
  }
}
