import type { TenantID, UUID } from '@certivo/lib-db';

export interface CreateProductRequest {
  tenantId: TenantID;
  productName: string;
  code?: string | null;
  createdBy?: UUID | null;
}

export interface CreateProductResponse {
  productId: UUID;
  code: string;
}
