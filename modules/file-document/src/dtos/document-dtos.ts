import type { Document, TenantID, UUID } from '@certivo/lib-db';

export interface UploadRequest {
  tenantId: TenantID;
  filename: string;
  mime: string;
  bytes: number;
  storageUrl?: string;
  sha256: string;
  dataBase64?: string;
}

export interface DocumentResponse {
  document: Document;
  signedUrl?: string;
}

export interface FetchRequest {
  tenantId: TenantID;
  documentId: UUID;
}

export interface DownloadUrlRequest {
  tenantId: TenantID;
  documentId: UUID;
  expiresInMs?: number;
}

export interface SignedDownloadRequest {
  tenantId: TenantID;
  documentId: UUID;
  expiresAt: number;
  signature: string;
}
