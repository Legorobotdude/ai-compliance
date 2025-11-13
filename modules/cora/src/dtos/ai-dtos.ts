import type { TenantID, UUID } from '@certivo/lib-db';

export type CertificateSchema = 'certificate_v1';

export interface AiParseDocumentRequest {
  tenantId: TenantID;
  documentId: UUID;
  schema?: CertificateSchema;
}

export interface AiDocumentFinding {
  substanceName: string;
  concentrationValue: number;
  concentrationUnit: '%' | 'ppm' | 'mg/kg' | null;
  concentrationPpm: number | null;
  notes: string | null;
}

export interface AiDocumentPart {
  partNumber: string;
  findings: AiDocumentFinding[];
}

export interface AiParseDocumentResponse {
  docRef: string;
  parts: AiDocumentPart[];
  ambiguities: string[];
  validationReport: string[];
}

export type SupplierEmailTone = 'formal' | 'neutral' | 'friendly';

export interface AiSupplierEmailRequest {
  tenantId: TenantID;
  supplierId: UUID;
  bomId: UUID;
  language?: string;
  tone?: SupplierEmailTone;
}

export interface AiSupplierEmailResponse {
  supplierId: UUID;
  bomId: UUID;
  subject: string;
  body: string;
  dueDate: string;
  language: string;
}

export interface AiRiskSummaryRequest {
  tenantId: TenantID;
  bomId?: UUID;
  productId?: UUID;
}

export interface AiSupplierGap {
  supplierName: string;
  reason: 'MISSING' | 'EXPIRED' | 'OVER_LIMIT';
  partNumbers: string[];
  etaDays: number;
}

export interface AiRiskSummaryResponse {
  summary: string;
  execSummary: string;
  topGaps: AiSupplierGap[];
  stats: Record<string, number>;
}
