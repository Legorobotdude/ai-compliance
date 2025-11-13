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
  promptHash: string;
  model: string;
  latencyMs: number;
  outcome: 'SUCCESS' | 'RETRY' | 'FAILED';
  createdAt: string;
};

type SupplierExposureRecord = {
  supplierId: UUID | null;
  supplierName: string | null;
  incidents: number;
  exposure: number;
};

type RegulationRecord = {
  id: UUID;
  code: string;
  name: string;
};

type RegulationViolationRecord = {
  violationParts: number;
  totalParts: number;
};

type SlaAggregateRecord = {
  supplierId: UUID;
  supplierName: string;
  avgDays: number | null;
  slaTargetDays: number | null;
  openWorkflows: number;
  escalations: number;
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
          s.*,
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
          lc.id,
          lc.prompt_hash as "promptHash",
          lc.model,
          lc.latency_ms as "latencyMs",
          case
            when lc.output_json is not null then 'SUCCESS'
            when lc.output_json is null and lc.latency_ms > 2000 then 'RETRY'
            else 'FAILED'
          end as "outcome",
          lc.created_at as "createdAt"
        from llm_calls lc
        where lc.tenant_id = $1
        order by lc.created_at desc
        limit $2
      `,
      values: [tenantId, limit]
    });
  }

  async listSupplierExposure(tenantId: TenantID): Promise<SupplierExposureRecord[]> {
    return this.db.query<SupplierExposureRecord>({
      text: `
        select
          coalesce(v.supplier_id, cs.supplier_id) as "supplierId",
          s.name as "supplierName",
          count(*)::int as incidents,
          coalesce(sum(bc.normalized_weight_mg)::int, 0) as exposure
        from v_blocked_supplier_parts v
        left join suppliers s on s.id = v.supplier_id
        left join component_suppliers cs
          on cs.tenant_id = v.tenant_id
         and cs.part_number = v.part_number
        left join bom_components bc
          on bc.tenant_id = v.tenant_id
         and bc.part_number = v.part_number
        where v.tenant_id = $1
        group by coalesce(v.supplier_id, cs.supplier_id), s.name
        having count(*) > 0
        order by incidents desc
      `,
      values: [tenantId]
    });
  }

  async listRegulations(limit: number): Promise<RegulationRecord[]> {
    return this.db.query<RegulationRecord>({
      text: `
        select id, code, name
        from regulations
        order by effective_date desc
        limit $1
      `,
      values: [limit]
    });
  }

  async countRegulationViolations(
    tenantId: TenantID,
    regulationId: UUID
  ): Promise<RegulationViolationRecord> {
    const rows = await this.db.query<RegulationViolationRecord>({
      text: `
        with limits as (
          select rl.substance, rl.limit_ppm
          from regulation_limits rl
          where rl.regulation_id = $2
        ),
        violation_parts as (
          select distinct c.part_number
          from certificates c
          join certificate_findings cf on cf.certificate_id = c.id
          join limits l on l.substance = cf.substance_name
          where c.tenant_id = $1
            and cf.concentration_ppm is not null
            and cf.concentration_ppm > l.limit_ppm
        )
        select
          (select count(*) from violation_parts)::int as "violationParts",
          (
            select count(distinct bc.part_number)
            from bom_components bc
            where bc.tenant_id = $1
          )::int as "totalParts"
      `,
      values: [tenantId, regulationId]
    });
    return rows[0] ?? { violationParts: 0, totalParts: 0 };
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
