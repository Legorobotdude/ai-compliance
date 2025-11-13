import { createHash, randomUUID } from 'node:crypto';
import type { Document } from '@certivo/lib-db';
import type { RetrievedObject, StorageAdapter } from '@certivo/lib-storage';
import type {
  DownloadUrlRequest,
  FetchRequest,
  SignedDownloadRequest,
  UploadRequest
} from '../dtos/document-dtos';
import { DocumentRepository } from '../repositories/document-repository';
import { DocumentUrlSigner } from './document-url-signer.js';

export class DocumentService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storage: StorageAdapter,
    private readonly signer: DocumentUrlSigner
  ) {}

  async upload(payload: UploadRequest): Promise<Document> {
    if (!payload.storageUrl && !payload.dataBase64) {
      throw new Error('Provide storageUrl or dataBase64 when uploading documents');
    }

    const documentId = randomUUID();
    const nowIso = new Date().toISOString();

    let storageUrl = payload.storageUrl ?? '';
    let storageBucket: string | null = null;
    let storageKey: string | null = null;
    let storageClass: string | null = null;

    if (payload.dataBase64) {
      const buffer = Buffer.from(payload.dataBase64, 'base64');
      if (buffer.byteLength !== payload.bytes) {
        throw new Error(`Provided bytes (${payload.bytes}) do not match decoded payload (${buffer.byteLength})`);
      }
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      if (sha256 !== payload.sha256.toLowerCase()) {
        throw new Error('Provided sha256 hash does not match decoded payload');
      }
      const saved = await this.storage.saveObject({
        tenantId: payload.tenantId,
        documentId,
        filename: payload.filename,
        contentType: payload.mime,
        data: buffer
      });
      storageUrl = saved.url;
      storageBucket = saved.bucket;
      storageKey = saved.key;
      storageClass = saved.storageClass ?? null;
    }

    if (!storageUrl) {
      throw new Error('storageUrl could not be determined for this document');
    }

    const document: Omit<Document, 'createdAt' | 'updatedAt'> = {
      id: documentId,
      tenantId: payload.tenantId,
      filename: payload.filename,
      mime: payload.mime,
      bytes: payload.bytes,
      storageUrl,
      storageBucket,
      storageKey,
      storageClass,
      kmsKeyId: null,
      sha256: payload.sha256,
      uploadedAt: nowIso,
      uploadStatus: 'READY',
      uploadCompletedAt: nowIso,
      scanStatus: 'NOT_REQUIRED',
      scanRequestedAt: null,
      scanCompletedAt: null,
      retentionExpiresAt: null,
      deletedAt: null,
      parsedJson: null
    };

    return this.repository.insert(document);
  }

  async fetch(request: FetchRequest): Promise<Document | null> {
    return this.repository.findById(request.tenantId, request.documentId);
  }

  async createDownloadUrl(request: DownloadUrlRequest): Promise<string> {
    const document = await this.repository.findById(request.tenantId, request.documentId);
    this.ensureDocumentAvailable(document);
    if (!this.canStreamViaGateway(document)) {
      return document.storageUrl;
    }
    return this.signer.createUrl({
      tenantId: request.tenantId,
      documentId: request.documentId,
      expiresInMs: request.expiresInMs
    });
  }

  async resolveSignedDownload(
    payload: SignedDownloadRequest
  ): Promise<{ document: Document; object: RetrievedObject }> {
    const valid = this.signer.verify({
      tenantId: payload.tenantId,
      documentId: payload.documentId,
      expiresAt: payload.expiresAt,
      signature: payload.signature
    });
    if (!valid) {
      throw new Error('Signed download token is invalid or expired');
    }
    const document = await this.repository.findById(payload.tenantId, payload.documentId);
    this.ensureDocumentAvailable(document);
    if (!this.canStreamViaGateway(document)) {
      throw new Error('Document cannot be served via the gateway download route');
    }
    const object = await this.storage.getObject({
      bucket: document.storageBucket,
      key: document.storageKey,
      url: document.storageUrl
    });
    return { document, object };
  }

  private ensureDocumentAvailable(document: Document | null): asserts document is Document {
    if (!document) {
      throw new Error('Document not found');
    }
    if (document.deletedAt) {
      throw new Error('Document is no longer available');
    }
  }

  private canStreamViaGateway(document: Document): boolean {
    if (document.storageBucket && document.storageKey) {
      return true;
    }
    return document.storageUrl.startsWith('file://');
  }
}
