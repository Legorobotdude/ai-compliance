import type {
  ComplianceStatusRow,
  DatabaseClient,
  Supplier,
  SupplierRequest,
  TenantID,
  UUID
} from '@certivo/lib-db';

type BomRecord = {
  id: UUID;
  productId: UUID;
  bomExternalId: string;
  uploadedAt: string;
  productName: string;
};

type BomRowRecord = {
  bomId: UUID;
  assemblyId: string;
  assemblyName: string | null;
  partNumber: string;
  supplierId: UUID | null;
  supplierName: string | null;
  status: ComplianceStatusRow['status'];
  validUntil: string | null;
  findings: Array<{ substance: string; ppm: number | null; thresholdPpm?: number | null }> | null;
};

type StatusCountRecord = {
  status: ComplianceStatusRow['status'];
  count: number;
};

type SupplierSummaryRecord = Supplier & {
  requestsOpen: number;
  lastRequestAt?: string | null;
};

type SupplierRequestDuration = {
  supplierId: UUID;
  durationDays: number | null;
  sentAt: string | null;
};

type IngestionIssueRecord = {
  id: UUID;
  bomId: UUID | null;
  partNumber: string | null;
  assemblyId: string | null;
  code: string;
  message: string;
  status: string;
  createdAt: string;
};

type AuditLogRecord = {
  id: UUID;
  action: string;
  target: string;
  actorUserId: UUID | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

type SlaAggregateRecord = {
  supplierId: UUID;
  supplierName: string;
  avgDays: number | null;
  slaTargetDays: number | null;
  openWorkflows: number;
  escalations: number;
};

type WorkflowEventType = 'SUPPLIER_REQUEST' | 'INGESTION' | 'IMPACT' | 'LLM' | 'SYSTEM';

type WorkflowEventRecord = {
  id: UUID;
  workflow: WorkflowEventType;
  payload: Record<string, unknown> | null;
  createdAt: string;
  requestId: UUID | null;
  issueId: UUID | null;
  supplierId: UUID | null;
  supplierName: string | null;
  requestStatus: string | null;
  dueAt: string | null;
  issueCode: string | null;
  issueStatus: string | null;
  issuePartNumber: string | null;
};

export class DashboardRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findBomById(tenantId: TenantID, bomId: UUID): Promise<BomRecord | null> {
    const rows = await this.db.query<BomRecord>({
      text: `
        select b.id,
               b.product_id as "productId",
               b.bom_external_id as "bomExternalId",
               b.uploaded_at as "uploadedAt",
               p.product_name as "productName"
        from boms b
        join products p on p.id = b.product_id
        where b.tenant_id = $1
          and b.id = $2
        limit 1
      `,
      values: [tenantId, bomId]
    });
    return rows[0] ?? null;
  }

  async findLatestBom(tenantId: TenantID): Promise<BomRecord | null> {
    const rows = await this.db.query<BomRecord>({
      text: `
        select b.id,
               b.product_id as "productId",
               b.bom_external_id as "bomExternalId",
               b.uploaded_at as "uploadedAt",
               p.product_name as "productName"
        from boms b
        join products p on p.id = b.product_id
        where b.tenant_id = $1
        order by b.uploaded_at desc
        limit 1
      `,
      values: [tenantId]
    });
    return rows[0] ?? null;
  }

  async fetchBomRows(tenantId: TenantID, bomId: UUID): Promise<BomRowRecord[]> {
    return this.db.query<BomRowRecord>({
      text: `
        select
          vcs.bom_id as "bomId",
          vcs.assembly_id as "assemblyId",
          sa.name as "assemblyName",
          vcs.part_number as "partNumber",
          vcs.supplier_id as "supplierId",
          s.name as "supplierName",
          vcs.status,
          vcs.valid_until as "validUntil",
          vcs.findings
        from v_compliance_status vcs
        left join bom_subassemblies sa
          on sa.tenant_id = vcs.tenant_id
         and sa.bom_id = vcs.bom_id
         and sa.assembly_id = vcs.assembly_id
        left join suppliers s on s.id = vcs.supplier_id
        where vcs.tenant_id = $1
          and vcs.bom_id = $2
        order by vcs.assembly_id, vcs.part_number
      `,
      values: [tenantId, bomId]
    });
  }

  async fetchStatusCounts(tenantId: TenantID, bomId: UUID): Promise<StatusCountRecord[]> {
    return this.db.query<StatusCountRecord>({
      text: `
        select vcs.status, count(*)::int as count
        from v_compliance_status vcs
        where vcs.tenant_id = $1
          and vcs.bom_id = $2
        group by vcs.status
      `,
      values: [tenantId, bomId]
    });
  }

  async listSuppliers(tenantId: TenantID, limit: number): Promise<SupplierSummaryRecord[]> {
    return this.db.query<SupplierSummaryRecord>({
      text: `
        select
          s.id,
          s.tenant_id as "tenantId",
          s.name,
          s.country,
          s.language,
          s.compliance_rate as "complianceRate",
          s.response_avg_days as "responseAvgDays",
          s.created_at as "createdAt",
          s.updated_at as "updatedAt",
          coalesce(open_requests.count, 0)::int as "requestsOpen",
          last_request.sent_at as "lastRequestAt"
        from suppliers s
        left join lateral (
          select count(*) as count
          from supplier_requests r
          where r.tenant_id = s.tenant_id
            and r.supplier_id = s.id
            and r.status in ('PENDING','SENT','ESCALATED')
        ) open_requests on true
        left join lateral (
          select max(r.sent_at) as sent_at
          from supplier_requests r
          where r.tenant_id = s.tenant_id
            and r.supplier_id = s.id
        ) last_request on true
        where s.tenant_id = $1
        order by s.updated_at desc
        limit $2
      `,
      values: [tenantId, limit]
    });
  }

  async listSupplierRequestDurations(tenantId: TenantID): Promise<SupplierRequestDuration[]> {
    return this.db.query<SupplierRequestDuration>({
      text: `
        select
          r.supplier_id as "supplierId",
          case
            when r.sent_at is not null and r.response_at is not null
              then extract(epoch from (r.response_at - r.sent_at)) / 86400.0
            when r.sent_at is not null and r.due_at is not null
              then extract(epoch from (r.due_at - r.sent_at)) / 86400.0
            else null
          end as "durationDays",
          r.sent_at as "sentAt"
        from supplier_requests r
        where r.tenant_id = $1
        order by r.sent_at asc nulls last
      `,
      values: [tenantId]
    });
  }

  async listSupplierRequests(tenantId: TenantID): Promise<SupplierRequest[]> {
    return this.db.query<SupplierRequest>({
      text: `
        select *
        from supplier_requests
        where tenant_id = $1
      `,
      values: [tenantId]
    });
  }

  async listIngestionIssues(tenantId: TenantID, limit: number): Promise<IngestionIssueRecord[]> {
    return this.db.query<IngestionIssueRecord>({
      text: `
        select
          ii.id,
          ii.bom_id as "bomId",
          ii.part_number as "partNumber",
          bc.assembly_id as "assemblyId",
          ii.code,
          ii.message,
          ii.status,
          ii.created_at as "createdAt"
        from ingestion_issues ii
        left join bom_components bc
          on bc.tenant_id = ii.tenant_id
         and bc.bom_id = ii.bom_id
         and bc.part_number = ii.part_number
        where ii.tenant_id = $1
        order by ii.created_at desc
        limit $2
      `,
      values: [tenantId, limit]
    });
  }

  async listAuditLogs(tenantId: TenantID, limit: number): Promise<AuditLogRecord[]> {
    return this.db.query<AuditLogRecord>({
      text: `
        select
          al.id,
          al.action,
          al.target,
          al.actor_user_id as "actorUserId",
          al.payload_json as payload,
          al.created_at as "createdAt"
        from audit_logs al
        where al.tenant_id = $1
        order by al.created_at desc
        limit $2
      `,
      values: [tenantId, limit]
    });
  }

  async listWorkflowEvents(tenantId: TenantID, limit: number): Promise<WorkflowEventRecord[]> {
    return this.db.query<WorkflowEventRecord>({
      text: `
        select
          we.id,
          we.workflow,
          we.payload,
          we.created_at as "createdAt",
          (we.payload->'trigger'->>'requestId')::uuid as "requestId",
          (we.payload->'trigger'->>'issueId')::uuid as "issueId",
          sr.supplier_id as "supplierId",
          s.name as "supplierName",
          sr.status as "requestStatus",
          sr.due_at as "dueAt",
          ii.code as "issueCode",
          ii.status as "issueStatus",
          ii.part_number as "issuePartNumber"
        from workflow_events we
        left join supplier_requests sr
          on sr.tenant_id = we.tenant_id
         and sr.id = (we.payload->'trigger'->>'requestId')::uuid
        left join suppliers s
          on s.tenant_id = sr.tenant_id
         and s.id = sr.supplier_id
        left join ingestion_issues ii
          on ii.tenant_id = we.tenant_id
         and ii.id = (we.payload->'trigger'->>'issueId')::uuid
        where we.tenant_id = $1
        order by we.created_at desc
        limit $2
      `,
      values: [tenantId, limit]
    });
  }

  async listSlaAggregates(tenantId: TenantID): Promise<SlaAggregateRecord[]> {
    return this.db.query<SlaAggregateRecord>({
      text: `
        with base as (
          select
            r.supplier_id,
            avg(
              case
                when r.sent_at is not null and r.response_at is not null
                  then extract(epoch from (r.response_at - r.sent_at)) / 86400.0
                when r.sent_at is not null and r.due_at is not null
                  then extract(epoch from (r.due_at - r.sent_at)) / 86400.0
                else null
              end
            ) as avg_days,
            avg(
              case
                when r.sent_at is not null and r.due_at is not null
                  then extract(epoch from (r.due_at - r.sent_at)) / 86400.0
                else null
              end
            ) as sla_days,
            sum(case when r.status in ('PENDING','SENT','ESCALATED') then 1 else 0 end) as open_workflows,
            sum(case when r.status = 'ESCALATED' then 1 else 0 end) as escalations
          from supplier_requests r
          where r.tenant_id = $1
          group by r.supplier_id
        )
        select
          base.supplier_id as "supplierId",
          coalesce(s.name, 'Unknown Supplier') as "supplierName",
          base.avg_days as "avgDays",
          base.sla_days as "slaTargetDays",
          coalesce(base.open_workflows, 0)::int as "openWorkflows",
          coalesce(base.escalations, 0)::int as "escalations"
        from base
        left join suppliers s on s.id = base.supplier_id
        order by base.avg_days desc nulls last
      `,
      values: [tenantId]
    });
  }
}
