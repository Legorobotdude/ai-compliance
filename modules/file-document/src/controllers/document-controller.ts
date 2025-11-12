import type { FetchRequest, UploadRequest } from '../dtos/document-dtos';
import { DocumentService } from '../services/document-service';

export class DocumentController {
  constructor(private readonly service: DocumentService) {}

  async upload(payload: UploadRequest) {
    return this.service.upload(payload);
  }

  async get(payload: FetchRequest) {
    const doc = await this.service.fetch(payload);
    if (!doc) {
      throw new Error('Document not found');
    }
    return doc;
  }
}
