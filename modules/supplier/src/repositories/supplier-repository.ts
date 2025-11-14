import type {
  AuditLogInsert,
  DatabaseClient,
  Supplier,
  SupplierContact,
  SupplierRequest,
  TenantID,
  UUID
} from '@certivo/lib-db';
import type { SupplierBlockedPart } from '../dtos/supplier-dtos.js';

export interface SupplierRequestMetrics {
  openRequests: number;
  dueSoon: number;
  slaBreaches: number;
  lastRequestAt?: string | null;
  avgResponseDays?: number | null;
}

export interface SupplierRequestRecord extends SupplierRequest {
  bomExternalId: string;
}

export interface BomSummary {
  bomId: UUID;
  bomExternalId: string;
  productName: string;
}

export interface LlmCallRecord {
  tenantId: TenantID;
  agent: 'SUPPLIER_EMAIL';
  promptHash: string;
  inputJson: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  model: string;
  latencyMs: number;
}

const SUPPLIER_COLUMNS = `
    id,
    tenant_id as "tenantId",
    name,
    country,
    language,
    compliance_rate as "complianceRate",
    response_avg_days as "responseAvgDays",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;

const supplierRequestColumns = (alias?: string) => `
    ${alias ? `${alias}.id` : 'id'} as "id",
    ${alias ? `${alias}.tenant_id` : 'tenant_id'} as "tenantId",
    ${alias ? `${alias}.supplier_id` : 'supplier_id'} as "supplierId",
    ${alias ? `${alias}.bom_id` : 'bom_id'} as "bomId",
    ${alias ? `${alias}.requested_by` : 'requested_by'} as "requestedBy",
    ${alias ? `${alias}.status` : 'status'}::text as status,
    ${alias ? `${alias}.sent_at` : 'sent_at'} as "sentAt",
    ${alias ? `${alias}.due_at` : 'due_at'} as "dueAt",
    ${alias ? `${alias}.last_reminder_at` : 'last_reminder_at'} as "lastReminderAt",
    ${alias ? `${alias}.response_at` : 'response_at'} as "responseAt",
    ${alias ? `${alias}.created_at` : 'created_at'} as "createdAt",
    ${alias ? `${alias}.updated_at` : 'updated_at'} as "updatedAt"
  `;

export class SupplierRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findSupplier(tenantId: TenantID, supplierId: UUID): Promise<Supplier | null> {
    const rows = await this.db.query<Supplier>({
      text: `select ${SUPPLIER_COLUMNS}
             from suppliers
             where tenant_id = $1 and id = $2`,
      values: [tenantId, supplierId]
    });
    return rows[0] ?? null;
  }

  async listContacts(tenantId: TenantID, supplierId: UUID): Promise<SupplierContact[]> {
    return this.db.query<SupplierContact>({
      text: `
        select
          sc.id,
          sc.supplier_id as "supplierId",
          sc.email,
          sc.name,
          sc.created_at as "createdAt",
          sc.updated_at as "updatedAt"
        from supplier_contacts sc
        join suppliers s on s.id = sc.supplier_id
        where s.tenant_id = $1
          and sc.supplier_id = $2
        order by sc.created_at asc
      `,
      values: [tenantId, supplierId]
    });
  }

  async listRecentRequests(
    tenantId: TenantID,
    supplierId: UUID,
    limit: number
  ): Promise<SupplierRequestRecord[]> {
    return this.db.query<SupplierRequestRecord>({
      text: `
        select
          ${supplierRequestColumns('r')},
          b.bom_external_id as "bomExternalId"
        from supplier_requests r
        join boms b on b.id = r.bom_id
        where r.tenant_id = $1
          and r.supplier_id = $2
        order by coalesce(r.sent_at, r.created_at) desc
        limit $3
      `,
      values: [tenantId, supplierId, limit]
    });
  }

  async getRequestMetrics(tenantId: TenantID, supplierId: UUID): Promise<SupplierRequestMetrics> {
    const [row] = await this.db.query<{
      openRequests: number;
      dueSoon: number;
      slaBreaches: number;
      lastRequestAt?: string | null;
      avgResponseDays?: string | null;
    }>({
      text: `
        select
          coalesce(count(*) filter (where status in ('PENDING','SENT','ESCALATED')), 0)::int as "openRequests",
          coalesce(
            count(*) filter (
              where status in ('PENDING','SENT','ESCALATED')
                and due_at is not null
                and due_at <= (now() + interval '3 days')
            ),
            0
          )::int as "dueSoon",
          coalesce(
            count(*) filter (
              where response_at is not null
                and due_at is not null
                and response_at > due_at
            ),
            0
          )::int as "slaBreaches",
          max(sent_at) as "lastRequestAt",
          avg(
            case
              when response_at is not null and sent_at is not null
                then extract(epoch from (response_at - sent_at)) / 86400.0
            end
          )::float8 as "avgResponseDays"
        from supplier_requests
        where tenant_id = $1
          and supplier_id = $2
      `,
      values: [tenantId, supplierId]
    });
    return {
      openRequests: row?.openRequests ?? 0,
      dueSoon: row?.dueSoon ?? 0,
      slaBreaches: row?.slaBreaches ?? 0,
      lastRequestAt: row?.lastRequestAt ?? null,
      avgResponseDays: row?.avgResponseDays != null ? Number(row.avgResponseDays) : null
    };
  }

  async listBlockedParts(
    tenantId: TenantID,
    supplierId: UUID,
    options?: { bomId?: UUID }
  ): Promise<SupplierBlockedPart[]> {
    const values: Array<TenantID | UUID> = [tenantId, supplierId];
    const filters: string[] = ['v.tenant_id = $1', 'v.supplier_id = $2'];
    if (options?.bomId) {
      values.push(options.bomId);
      filters.push(`v.bom_id = $${values.length}`);
    }
    return this.db.query<SupplierBlockedPart>({
      text: `
        select
          v.bom_id as "bomId",
          b.bom_external_id as "bomExternalId",
          v.part_number as "partNumber",
          v.assembly_id as "assemblyId",
          ba.name as "assemblyName",
          v.reason
        from v_blocked_supplier_parts v
        join boms b on b.id = v.bom_id and b.tenant_id = v.tenant_id
        left join bom_subassemblies ba
          on ba.tenant_id = v.tenant_id
         and ba.bom_id = v.bom_id
         and ba.assembly_id = v.assembly_id
        where ${filters.join(' and ')}
        order by v.reason, v.part_number
      `,
      values
    });
  }

  async createRequest(payload: {
    tenantId: TenantID;
    supplierId: UUID;
    bomId: UUID;
    dueAt: string;
    requestedBy: UUID;
  }): Promise<SupplierRequest> {
    const [result] = await this.db.query<SupplierRequest>({
      text: `
        insert into supplier_requests (tenant_id, supplier_id, bom_id, requested_by, status, due_at)
        values ($1,$2,$3,$4,'PENDING',$5)
        returning ${supplierRequestColumns()}
      `,
      values: [payload.tenantId, payload.supplierId, payload.bomId, payload.requestedBy, payload.dueAt]
    });
    if (!result) {
      throw new Error('Failed to create supplier request');
    }
    return result;
  }

  async findBomSummary(tenantId: TenantID, bomId: UUID): Promise<BomSummary | null> {
    const rows = await this.db.query<BomSummary>({
      text: `
        select
          b.id as "bomId",
          b.bom_external_id as "bomExternalId",
          p.product_name as "productName"
        from boms b
        join products p on p.id = b.product_id
        where b.tenant_id = $1
          and b.id = $2
      `,
      values: [tenantId, bomId]
    });
    return rows[0] ?? null;
  }

  async recordAuditLog(entry: AuditLogInsert): Promise<void> {
    await this.db.query({
      text: `
        insert into audit_logs (tenant_id, actor_user_id, action, target, payload_json)
        values ($1,$2,$3,$4,$5::jsonb)
      `,
      values: [entry.tenantId, entry.actorUserId ?? null, entry.action, entry.target, entry.payload ?? null]
    });
  }

  async recordLlmCall(payload: LlmCallRecord): Promise<void> {
    await this.db.query({
      text: `
        insert into llm_calls (tenant_id, agent, prompt_hash, input_json, output_json, model, latency_ms)
        values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)
      `,
      values: [
        payload.tenantId,
        payload.agent,
        payload.promptHash,
        payload.inputJson,
        payload.outputJson ?? null,
        payload.model,
        payload.latencyMs
      ]
    });
  }
}
