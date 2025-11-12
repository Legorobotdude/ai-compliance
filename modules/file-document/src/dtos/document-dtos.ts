import type { Document, TenantID, UUID } from '@certivo/lib-db';

export interface UploadRequest {
  tenantId: TenantID;
  filename: string;
  mime: string;
  bytes: number;
  storageUrl: string;
  sha256: string;
}

export interface DocumentResponse {
  document: Document;
  signedUrl?: string;
}

export interface FetchRequest {
  tenantId: TenantID;
  documentId: UUID;
}
