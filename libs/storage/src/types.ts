import type { TenantID, UUID } from '@certivo/lib-db';

export interface StorageObjectReference {
  bucket: string;
  key: string;
  url: string;
  storageClass?: string;
  kmsKeyId?: string | null;
}

export interface SaveObjectParams {
  tenantId: TenantID;
  documentId: UUID;
  filename: string;
  data: Buffer;
  contentType?: string;
}

export interface GetObjectParams {
  bucket?: string | null;
  key?: string | null;
  url?: string | null;
}

export interface RetrievedObject {
  stream: NodeJS.ReadableStream;
  contentLength?: number;
  contentType?: string;
}

export interface StorageAdapter {
  saveObject(params: SaveObjectParams): Promise<StorageObjectReference>;
  getObject(params: GetObjectParams): Promise<RetrievedObject>;
}
