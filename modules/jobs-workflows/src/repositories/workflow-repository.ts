import type {
  AuditLogInsert,
  DatabaseClient,
  IngestionIssue,
  SupplierRequest,
  TenantID,
  UUID
} from '@certivo/lib-db';

export type WorkflowEventType = 'SUPPLIER_REQUEST' | 'INGESTION' | 'IMPACT' | 'LLM' | 'SYSTEM';

export class WorkflowRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getSupplierRequest(tenantId: TenantID, requestId: UUID): Promise<SupplierRequest | null> {
    const rows = await this.db.query<SupplierRequest>({
      text: `select
               id,
               tenant_id as "tenantId",
               supplier_id as "supplierId",
               bom_id as "bomId",
               requested_by as "requestedBy",
               status::text as status,
               sent_at as "sentAt",
               due_at as "dueAt",
               last_reminder_at as "lastReminderAt",
               response_at as "responseAt",
               created_at as "createdAt",
               updated_at as "updatedAt"
             from supplier_requests
             where tenant_id = $1 and id = $2`,
      values: [tenantId, requestId]
    });
    return rows[0] ?? null;
  }

  async markSupplierRequestSent(tenantId: TenantID, requestId: UUID): Promise<void> {
    await this.db.query({
      text: `update supplier_requests
             set status = 'SENT',
                 sent_at = coalesce(sent_at, now()),
                 updated_at = now()
             where tenant_id = $1 and id = $2`,
      values: [tenantId, requestId]
    });
    await this.recordAuditLog({
      tenantId,
      action: 'supplier.request.status.sent',
      target: `supplier_request:${requestId}`,
      payload: { requestId, status: 'SENT' }
    });
  }

  async markSupplierReminder(tenantId: TenantID, requestId: UUID): Promise<void> {
    await this.db.query({
      text: `update supplier_requests
             set last_reminder_at = now(),
                 updated_at = now()
             where tenant_id = $1 and id = $2`,
      values: [tenantId, requestId]
    });
    await this.recordAuditLog({
      tenantId,
      action: 'supplier.request.status.reminder',
      target: `supplier_request:${requestId}`,
      payload: { requestId }
    });
  }

  async markSupplierEscalated(tenantId: TenantID, requestId: UUID): Promise<void> {
    await this.db.query({
      text: `update supplier_requests
             set status = 'ESCALATED',
                 last_reminder_at = now(),
                 updated_at = now()
             where tenant_id = $1 and id = $2`,
      values: [tenantId, requestId]
    });
    await this.recordAuditLog({
      tenantId,
      action: 'supplier.request.status.escalated',
      target: `supplier_request:${requestId}`,
      payload: { requestId, status: 'ESCALATED' }
    });
  }

  async completeSupplierRequest(
    tenantId: TenantID,
    requestId: UUID,
    options: { responded: boolean; respondedAt?: string | null }
  ): Promise<void> {
    const status = options.responded ? 'RESPONDED' : 'CLOSED';
    await this.db.query({
      text: `update supplier_requests
             set status = $3,
                 response_at = coalesce($4, response_at),
                 updated_at = now()
             where tenant_id = $1 and id = $2`,
      values: [tenantId, requestId, status, options.respondedAt ?? null]
    });
    await this.recordAuditLog({
      tenantId,
      action: options.responded ? 'supplier.request.status.responded' : 'supplier.request.status.closed',
      target: `supplier_request:${requestId}`,
      payload: {
        requestId,
        status,
        respondedAt: options.respondedAt ?? null
      }
    });
  }

  async markIssueInProgress(issueId: UUID): Promise<void> {
    await this.db.query({
      text: `update ingestion_issues set status = 'IN_PROGRESS', updated_at = now() where id = $1`,
      values: [issueId]
    });
  }

  async getIngestionIssue(issueId: UUID): Promise<IngestionIssue | null> {
    const rows = await this.db.query<IngestionIssue>({
      text: `select
               id,
               tenant_id as "tenantId",
               bom_id as "bomId",
               part_number as "partNumber",
               code,
               message,
               status,
               created_at as "createdAt",
               updated_at as "updatedAt"
             from ingestion_issues
             where id = $1`,
      values: [issueId]
    });
    return rows[0] ?? null;
  }

  async resolveIssue(issueId: UUID): Promise<void> {
    await this.db.query({
      text: `update ingestion_issues set status = 'RESOLVED', updated_at = now() where id = $1`,
      values: [issueId]
    });
  }

  async hasSupplierMapping(tenantId: TenantID, partNumber: string): Promise<boolean> {
    const rows = await this.db.query<{ exists: boolean }>({
      text: `select exists(
               select 1
               from component_suppliers
               where tenant_id = $1
                 and part_number = $2
             ) as exists`,
      values: [tenantId, partNumber]
    });
    return rows[0]?.exists ?? false;
  }

  async getComponentIngestionSnapshot(
    tenantId: TenantID,
    bomId: UUID,
    partNumber: string
  ): Promise<{ exists: boolean; hasWeight: boolean }> {
    const rows = await this.db.query<{ exists: boolean; hasWeight: boolean }>({
      text: `select
               count(*) > 0 as exists,
               coalesce(bool_or(bc.normalized_weight_mg is not null), false) as "hasWeight"
             from bom_components bc
             where bc.tenant_id = $1
               and bc.bom_id = $2
               and bc.part_number = $3`,
      values: [tenantId, bomId, partNumber]
    });
    const snapshot = rows[0];
    return {
      exists: snapshot?.exists ?? false,
      hasWeight: snapshot?.hasWeight ?? false
    };
  }

  async hasCleanCertificateData(tenantId: TenantID, partNumber: string): Promise<boolean> {
    const rows = await this.db.query<{ ok: boolean }>({
      text: `select exists(
               select 1
               from certificates c
               where c.tenant_id = $1
                 and c.part_number = $2
                 and exists (
                   select 1
                   from certificate_findings cf
                   where cf.certificate_id = c.id
                     and cf.data_quality not in ('VALUE_MISSING','UNIT_MISSING')
                 )
                 and not exists (
                   select 1
                   from certificate_findings cf
                   where cf.certificate_id = c.id
                     and cf.data_quality in ('VALUE_MISSING','UNIT_MISSING')
                 )
             ) as ok`,
      values: [tenantId, partNumber]
    });
    return rows[0]?.ok ?? false;
  }

  async logWorkflowEvent(tenantId: TenantID, workflow: WorkflowEventType, payload: unknown) {
    await this.db.query({
      text: `insert into workflow_events (tenant_id, workflow, payload)
             values ($1, $2, $3::jsonb)`,
      values: [tenantId, workflow, payload]
    });
  }

  private async recordAuditLog(entry: AuditLogInsert): Promise<void> {
    await this.db.query({
      text: `insert into audit_logs (tenant_id, actor_user_id, action, target, payload_json)
             values ($1,$2,$3,$4,$5::jsonb)`,
      values: [entry.tenantId, entry.actorUserId ?? null, entry.action, entry.target, entry.payload ?? null]
    });
  }
}
