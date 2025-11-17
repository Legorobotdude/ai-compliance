export type UUID = string;
export type TenantID = string;

export interface Timestamped {
  createdAt: string;
  updatedAt?: string | null;
}

export interface Bom {
  id: UUID;
  tenantId: TenantID;
  productId: UUID;
  bomExternalId: string;
  uploadedBy: UUID;
  uploadedAt: string;
  sourceDocId?: UUID | null;
}

export interface BomSubassembly extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  bomId: UUID;
  assemblyId: string;
  name: string;
  parentAssemblyId?: string | null;
}

export interface BomComponent extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  bomId: UUID;
  assemblyId: string;
  partNumber: string;
  material?: string | null;
  weightG?: number | null;
  weightMg?: number | null;
  normalizedWeightMg?: number | null;
}

export interface ComponentSupplier extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  partNumber: string;
  supplierId: UUID;
  sourcingType?: 'PRIMARY' | 'SECONDARY' | 'CONTRACT';
}

export interface SupplierContact extends Timestamped {
  id: UUID;
  supplierId: UUID;
  email: string;
  name?: string | null;
}

export interface Supplier extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  name: string;
  country: string;
  language: string;
  complianceRate: number;
  responseAvgDays: number;
}

export interface SupplierRequest extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  supplierId: UUID;
  bomId: UUID;
  requestedBy?: UUID | null;
  status: 'PENDING' | 'SENT' | 'RESPONDED' | 'ESCALATED' | 'CLOSED';
  sentAt?: string | null;
  dueAt?: string | null;
  lastReminderAt?: string | null;
  responseAt?: string | null;
}

export interface Certificate extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  type: 'ROHS' | 'REACH' | 'CUSTOM';
  supplierId: UUID;
  partNumber: string;
  declarationDate?: string | null;
  validUntil?: string | null;
  thresholdPpm?: number | null;
  documentLimitSource?: 'DOC' | 'REGULATION' | null;
  sourceDocId?: UUID | null;
}

export interface CertificateFinding extends Timestamped {
  id: UUID;
  certificateId: UUID;
  substanceName: string;
  concentrationValue?: number | null;
  concentrationUnit?: '%' | 'ppm' | 'mg/kg' | null;
  concentrationPpm?: number | null;
  concentrationRaw?: string | null;
  dataQuality?: 'OK' | 'UNIT_MISSING' | 'VALUE_MISSING' | 'OUTLIER' | null;
}

export type DocumentUploadStatus = 'PENDING_UPLOAD' | 'UPLOADED' | 'VALIDATED' | 'READY' | 'FAILED';

export type DocumentScanStatus = 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'CLEAN' | 'INFECTED' | 'ERROR';

export interface Document extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  filename: string;
  mime: string;
  bytes: number;
  storageUrl: string;
  storageBucket?: string | null;
  storageKey?: string | null;
  storageClass?: string | null;
  kmsKeyId?: string | null;
  sha256: string;
  uploadedAt: string;
  uploadStatus: DocumentUploadStatus;
  uploadCompletedAt?: string | null;
  scanStatus: DocumentScanStatus;
  scanRequestedAt?: string | null;
  scanCompletedAt?: string | null;
  retentionExpiresAt?: string | null;
  deletedAt?: string | null;
  parsedJson?: Record<string, unknown> | null;
}

export interface Regulation extends Timestamped {
  id: UUID;
  code: string;
  name: string;
  region: string;
  version: string;
  effectiveDate: string;
}

export interface RegulationLimit extends Timestamped {
  id: UUID;
  regulationId: UUID;
  substance: string;
  limitPpm: number;
}

export interface ComplianceStatusRow {
  bomId: UUID;
  assemblyId: string;
  partNumber: string;
  supplierId?: UUID | null;
  status: 'COMPLIANT' | 'MISSING' | 'EXPIRED' | 'OVER_LIMIT';
  validUntil?: string | null;
  findings?: Array<{ substance: string; ppm: number; thresholdPpm?: number | null }>;
}

export interface IngestionIssue extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  bomId?: UUID | null;
  partNumber?: string | null;
  code: 'SUPPLIER_MISSING' | 'VALUE_MISSING' | 'UNIT_MISSING' | 'UPLOAD_ERROR';
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
}

export interface RegulationScenarioDelta {
  partNumber: string;
  supplierId?: UUID | null;
  assemblyId: string;
  before: 'COMPLIANT' | 'OVER_LIMIT';
  after: 'COMPLIANT' | 'OVER_LIMIT';
}

export interface AuditLog extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  actorUserId?: UUID | null;
  action: string;
  target: string;
  payloadJson?: Record<string, unknown>;
}

export interface AuditLogInsert {
  tenantId: TenantID;
  actorUserId?: UUID | null;
  action: string;
  target: string;
  payload?: Record<string, unknown>;
}

export interface LlmCall extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  agent: 'DOCUMENT_PARSE' | 'SUPPLIER_EMAIL' | 'RISK_SUMMARY' | 'CHAT';
  promptHash: string;
  inputJson: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  model: string;
  latencyMs: number;
}

export type RagDocumentStatus = 'PENDING' | 'CHUNKING' | 'EMBEDDING' | 'READY' | 'FAILED';
export type RagSourceType = 'DOCUMENT' | 'REGULATION' | 'NOTE';

export interface RagDocument extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  sourceKey: string;
  sourceDocumentId?: UUID | null;
  regulationId?: UUID | null;
  title: string;
  description?: string | null;
  sourceType: RagSourceType;
  language?: string | null;
  sourceUrl?: string | null;
  checksum: string;
  tokenCount: number;
  chunkCount: number;
  status: RagDocumentStatus;
  lastError?: string | null;
  metadata?: Record<string, unknown> | null;
  indexedAt?: string | null;
}

export interface RagChunk extends Timestamped {
  id: UUID;
  tenantId: TenantID;
  documentId: UUID;
  regulationId?: UUID | null;
  content: string;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  chunkIndex: number;
  tokenCount?: number | null;
  citationLabel?: string | null;
}

export interface RagQueryLog {
  id: UUID;
  tenantId: TenantID;
  query: string;
  topK: number;
  filters?: Record<string, unknown>;
  resultIds: UUID[];
  conversationId?: UUID | null;
  createdAt: string;
}
