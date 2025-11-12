import type {
  ComponentSupplier,
  DatabaseClient,
  Supplier,
  SupplierRequest,
  TenantID,
  UUID
} from '@certivo/lib-db';

export class SupplierRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findSupplier(tenantId: TenantID, supplierId: UUID): Promise<Supplier | null> {
    const rows = await this.db.query<Supplier>({
      text: `select * from suppliers where tenant_id = $1 and id = $2`,
      values: [tenantId, supplierId]
    });
    return rows[0] ?? null;
  }

  async listOpenRequests(tenantId: TenantID, supplierId: UUID): Promise<SupplierRequest[]> {
    return this.db.query<SupplierRequest>({
      text: `select * from supplier_requests where tenant_id = $1 and supplier_id = $2 and status in ('PENDING','SENT','ESCALATED')`,
      values: [tenantId, supplierId]
    });
  }

  async createRequest(payload: { tenantId: TenantID; supplierId: UUID; bomId: UUID; dueAt: string; requestedBy: UUID }): Promise<UUID> {
    const [result] = await this.db.query<{ id: UUID }>({
      text: `insert into supplier_requests (tenant_id, supplier_id, bom_id, status, due_at, sent_at, requested_by)
             values ($1,$2,$3,'PENDING',$4,null,$5)
             returning id`,
      values: [payload.tenantId, payload.supplierId, payload.bomId, payload.dueAt, payload.requestedBy]
    });
    if (!result) {
      throw new Error('Failed to create supplier request');
    }
    return result.id;
  }

  async listComponentMappings(tenantId: TenantID, supplierId: UUID): Promise<ComponentSupplier[]> {
    return this.db.query<ComponentSupplier>({
      text: `select * from component_suppliers where tenant_id = $1 and supplier_id = $2`,
      values: [tenantId, supplierId]
    });
  }

  async blockedParts(tenantId: TenantID, supplierId: UUID): Promise<Array<{ partNumber: string; assemblyId: string; reason: string }>> {
    return this.db.query({
      text: `select part_number as "partNumber", assembly_id as "assemblyId", reason
             from v_blocked_supplier_parts
             where tenant_id = $1 and supplier_id = $2`,
      values: [tenantId, supplierId]
    });
  }
}
