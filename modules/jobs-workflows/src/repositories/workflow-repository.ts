import type { DatabaseClient, TenantID, UUID } from '@certivo/lib-db';

export class WorkflowRepository {
  constructor(private readonly db: DatabaseClient) {}

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

  async logWorkflowEvent(tenantId: TenantID, workflow: string, payload: unknown) {
    await this.db.query({
      text: `insert into workflow_events (tenant_id, workflow, payload)
             values ($1, $2, $3::jsonb)`,
      values: [tenantId, workflow, payload]
    });
  }
}
