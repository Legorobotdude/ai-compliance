import type { TenantID, UUID } from '@certivo/lib-db';

export interface SupplierWorkflowTrigger {
  tenantId: TenantID;
  supplierId: UUID;
  bomId: UUID;
  dueAt: string;
}

export interface IngestionRetryTrigger {
  tenantId: TenantID;
  bomId: UUID;
  issueId: UUID;
}
