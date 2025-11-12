import type {
  ComponentSupplier,
  Supplier,
  SupplierRequest,
  TenantID,
  UUID
} from '@certivo/lib-db';

export interface ScorecardRequest {
  tenantId: TenantID;
  supplierId: UUID;
}

export interface ScorecardResponse {
  supplier: Supplier;
  requestsOpen: number;
  avgResponseDays: number;
  lastRequest?: string | null;
  blockedParts: Array<{ partNumber: string; assemblyId: string; reason: string }>;
}

export interface SupplierRequestInput {
  tenantId: TenantID;
  supplierId: UUID;
  bomId: UUID;
  dueAt: string;
  requestedBy: UUID;
}

export interface SupplierRequestWithContacts extends SupplierRequest {
  contacts: Array<{ name: string; email: string }>;
}

export interface SupplierLocalizationContext {
  supplier: Supplier;
  components: ComponentSupplier[];
}
