import type { Document } from '@certivo/lib-db';
import type { FetchRequest, UploadRequest } from '../dtos/document-dtos';
import { DocumentRepository } from '../repositories/document-repository';

export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  async upload(payload: UploadRequest): Promise<Document> {
    const document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'> = {
      tenantId: payload.tenantId,
      filename: payload.filename,
      mime: payload.mime,
      bytes: payload.bytes,
      storageUrl: payload.storageUrl,
      sha256: payload.sha256,
      uploadedAt: new Date().toISOString(),
      parsedJson: null
    };
    return this.repository.insert(document);
  }

  async fetch(request: FetchRequest): Promise<Document | null> {
    return this.repository.findById(request.tenantId, request.documentId);
  }
}
