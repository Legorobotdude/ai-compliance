import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TenantID, UUID } from '@certivo/lib-db';

export interface DocumentUrlSignerOptions {
  baseUrl: string;
  secret: string;
  defaultTtlMs?: number;
}

export interface SignedUrlComponents {
  tenantId: TenantID;
  documentId: UUID;
  expiresAt: number;
  signature: string;
}

export class DocumentUrlSigner {
  private readonly baseUrl: URL;
  private readonly secret: string;
  private readonly defaultTtlMs: number;

  constructor(options: DocumentUrlSignerOptions) {
    if (!options.baseUrl) {
      throw new Error('DocumentUrlSigner requires a baseUrl');
    }
    if (!options.secret) {
      throw new Error('DocumentUrlSigner requires a secret');
    }
    this.baseUrl = new URL(options.baseUrl);
    this.secret = options.secret;
    this.defaultTtlMs = Math.max(60_000, options.defaultTtlMs ?? 5 * 60_000);
  }

  createUrl(payload: { tenantId: TenantID; documentId: UUID; expiresInMs?: number }): string {
    const expiresAt = Date.now() + (payload.expiresInMs ?? this.defaultTtlMs);
    const signature = this.sign(payload.tenantId, payload.documentId, expiresAt);
    const url = new URL('/documents/raw', this.baseUrl);
    url.searchParams.set('tenant', payload.tenantId);
    url.searchParams.set('doc', payload.documentId);
    url.searchParams.set('expires', expiresAt.toString());
    url.searchParams.set('sig', signature);
    return url.toString();
  }

  verify(payload: SignedUrlComponents): boolean {
    if (Date.now() > payload.expiresAt) {
      return false;
    }
    const expected = this.sign(payload.tenantId, payload.documentId, payload.expiresAt);
    const actualBuffer = Buffer.from(payload.signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (actualBuffer.length === 0 || actualBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private sign(tenantId: TenantID, documentId: UUID, expiresAt: number): string {
    const data = `${tenantId}:${documentId}:${expiresAt}`;
    return createHmac('sha256', this.secret).update(data).digest('hex');
  }
}
