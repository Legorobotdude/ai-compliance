import type { DatabaseClient, SupplierRequest, TenantID, UUID } from '@certivo/lib-db';

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
  }

  async markSupplierReminder(tenantId: TenantID, requestId: UUID): Promise<void> {
    await this.db.query({
      text: `update supplier_requests
             set last_reminder_at = now(),
                 updated_at = now()
             where tenant_id = $1 and id = $2`,
      values: [tenantId, requestId]
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
  }

  async markIssueInProgress(issueId: UUID): Promise<void> {
    await this.db.query({
      text: `update ingestion_issues set status = 'IN_PROGRESS', updated_at = now() where id = $1`,
      values: [issueId]
    });
  }

  async resolveIssue(issueId: UUID): Promise<void> {
    await this.db.query({
      text: `update ingestion_issues set status = 'RESOLVED', updated_at = now() where id = $1`,
      values: [issueId]
    });
  }

  async logWorkflowEvent(tenantId: TenantID, workflow: WorkflowEventType, payload: unknown) {
    await this.db.query({
      text: `insert into workflow_events (tenant_id, workflow, payload)
             values ($1, $2, $3::jsonb)`,
      values: [tenantId, workflow, payload]
    });
  }
}
