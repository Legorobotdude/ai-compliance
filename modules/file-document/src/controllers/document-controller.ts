import type {
  DownloadUrlRequest,
  FetchRequest,
  SignedDownloadRequest,
  UploadRequest
} from '../dtos/document-dtos';
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

  async createDownloadUrl(payload: DownloadUrlRequest) {
    return this.service.createDownloadUrl(payload);
  }

  async streamSignedDownload(payload: SignedDownloadRequest) {
    return this.service.resolveSignedDownload(payload);
  }
}
