import type {
  Certificate,
  CertificateFinding,
  TenantID,
  UUID
} from '@certivo/lib-db';

export interface CertificateFindingInput {
  substanceName: string;
  concentrationValue?: number | null;
  concentrationUnit?: '%' | 'ppm' | 'mg/kg' | null;
  concentrationRaw?: string | null;
}

export interface CertificateInput {
  supplierId: UUID;
  partNumber: string;
  type: Certificate['type'];
  declarationDate?: string | null;
  validUntil?: string | null;
  thresholdPpm?: number | null;
  documentLimitSource?: Certificate['documentLimitSource'];
  sourceDocumentId?: UUID | null;
  findings: CertificateFindingInput[];
}

export interface CertificateUploadRequest {
  tenantId: TenantID;
  certificates: CertificateInput[];
}

export interface CertificateUploadIssue {
  code: 'VALUE_MISSING' | 'UNIT_MISSING';
  message: string;
  partNumber: string;
  substanceName: string;
}

export interface CertificateUploadResult {
  certificateId: UUID;
  findings: number;
  validUntil?: string | null;
  dataQualityFlags: number;
}

export interface CertificateUploadResponse {
  items: CertificateUploadResult[];
  issues: CertificateUploadIssue[];
}

export type PersistableCertificate = Omit<Certificate, 'id' | 'createdAt' | 'updatedAt'>;
export type PersistableCertificateFinding = Omit<CertificateFinding, 'id' | 'createdAt' | 'updatedAt'>;
