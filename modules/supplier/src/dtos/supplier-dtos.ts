import type {
  Supplier,
  SupplierContact,
  SupplierRequest,
  TenantID,
  UUID
} from '@certivo/lib-db';

export interface ScorecardRequest {
  tenantId: TenantID;
  supplierId: UUID;
}

export type SupplierRequestTone = 'formal' | 'neutral' | 'friendly';

export interface SupplierEmailDraft {
  subject: string;
  body: string;
  language: string;
  dueDate: string;
  uploadUrl: string;
}

export interface SupplierBlockedPart {
  bomId: UUID;
  bomExternalId: string;
  partNumber: string;
  assemblyId: string;
  assemblyName?: string | null;
  reason: 'MISSING' | 'EXPIRED' | 'OVER_LIMIT' | 'VALUE_MISSING';
}

export interface SupplierScorecardStats {
  complianceRate: number;
  targetResponseDays: number;
  actualResponseDays?: number | null;
  openRequests: number;
  dueSoon: number;
  slaBreaches: number;
  lastRequestAt?: string | null;
}

export interface SupplierProfile extends Supplier {
  contacts: SupplierContact[];
}

export interface SupplierRequestSummary {
  id: UUID;
  bomId: UUID;
  bomExternalId: string;
  status: SupplierRequest['status'];
  sentAt?: string | null;
  dueAt?: string | null;
  responseAt?: string | null;
}

export interface ScorecardResponse {
  supplier: SupplierProfile;
  stats: SupplierScorecardStats;
  blockedParts: SupplierBlockedPart[];
  recentRequests: SupplierRequestSummary[];
}

export interface SupplierRequestInput {
  tenantId: TenantID;
  supplierId: UUID;
  bomId: UUID;
  requestedBy: UUID;
  dueAt?: string;
  tone?: SupplierRequestTone;
  languageOverride?: string;
}

export interface SupplierRequestResult {
  requestId: UUID;
  status: SupplierRequest['status'];
  dueAt: string;
  blockedParts: SupplierBlockedPart[];
  emailDraft: SupplierEmailDraft;
  workflowScheduled: boolean;
}
