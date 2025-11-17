import type {
  ComplianceStatusRow,
  DatabaseClient,
  Regulation,
  RegulationLimit,
  RegulationScenarioDelta,
  TenantID,
  UUID
} from '@certivo/lib-db';
import type {
  ImpactScenarioPayload,
  ImpactScenarioRecord,
  ImpactSummary,
  ImpactScenarioVectorEntry,
  RegulationContext,
  RiskDataFreshness,
  RiskSnapshot,
  SupplierRiskStat
} from '../dtos/impact-dtos.js';

export class RiskRepository {
  constructor(private readonly db: DatabaseClient) {}

  async loadRegulationContext(code: string): Promise<RegulationContext | null> {
    const regulation = await this.findRegulationByCode(code);
    if (!regulation) {
      return null;
    }
    const limits = await this.listLimits(regulation.id);
    return { regulation, limits };
  }

  async fetchStatusRows(
    tenantId: TenantID,
    bomId?: UUID,
    filters?: { supplierIds?: UUID[]; assemblyIds?: string[] }
  ): Promise<ComplianceStatusRow[]> {
    const combinedFilters = {
      ...(bomId ? { bomIds: [bomId] } : {}),
      ...(filters ?? {})
    };
    return this.fetchComplianceRows(tenantId, combinedFilters);
  }

  async fetchComplianceSnapshots(
    tenantId: TenantID,
    filters?: { bomIds?: UUID[] }
  ): Promise<RiskSnapshot[]> {
    const rows = await this.fetchComplianceRows(tenantId, filters);
    const grouped = new Map<UUID, ComplianceStatusRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.bomId) ?? [];
      list.push(row);
      grouped.set(row.bomId, list);
    }
    return Array.from(grouped.entries()).map(([bomId, status]) => ({ bomId, status }));
  }

  async listSupplierStats(tenantId: TenantID, supplierIds?: UUID[]): Promise<SupplierRiskStat[]> {
    const hasFilter = Array.isArray(supplierIds) && supplierIds.length > 0;
    const clause = hasFilter ? 'and s.id = any($2::uuid[])' : '';
    const values: unknown[] = hasFilter ? [tenantId, supplierIds] : [tenantId];
    return this.db.query<SupplierRiskStat>({
      text: `
        select
          s.id as "supplierId",
          s.name,
          s.country,
          s.language,
          s.compliance_rate as "complianceRate",
          s.response_avg_days as "responseAvgDays",
          coalesce(open_requests.count, 0)::int as "openRequests",
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
        ${clause}
        order by s.updated_at desc
      `,
      values
    });
  }

  async listRecentImpactScenarios(
    tenantId: TenantID,
    limit = 5
  ): Promise<ImpactScenarioRecord[]> {
    const rows = await this.db.query<DbImpactScenarioRow>({
      text: `
        select
          id,
          tenant_id as "tenantId",
          regulation_code as "regulationCode",
          payload,
          created_at as "createdAt",
          updated_at as "updatedAt"
        from impact_scenarios
        where tenant_id = $1
        order by created_at desc
        limit $2
      `,
      values: [tenantId, limit]
    });
    return rows.map((row) => this.mapImpactScenarioRow(row));
  }

  async getRiskDataFreshness(tenantId: TenantID): Promise<RiskDataFreshness> {
    const [row] = await this.db.query<RiskDataFreshnessRow>({
      text: `
        select
          (select max(updated_at) from bom_components where tenant_id = $1) as "bomComponentsUpdatedAt",
          (select max(updated_at) from certificates where tenant_id = $1) as "certificatesUpdatedAt",
          (select max(updated_at) from suppliers where tenant_id = $1) as "supplierUpdatedAt",
          (select max(updated_at) from impact_scenarios where tenant_id = $1) as "scenarioUpdatedAt"
      `,
      values: [tenantId]
    });
    const latestCursor = this.computeLatestCursor(row);
    return {
      bomComponentsUpdatedAt: row?.bomComponentsUpdatedAt ?? null,
      certificatesUpdatedAt: row?.certificatesUpdatedAt ?? null,
      supplierUpdatedAt: row?.supplierUpdatedAt ?? null,
      scenarioUpdatedAt: row?.scenarioUpdatedAt ?? null,
      latestCursor
    };
  }

  async listLatestRegulations(limit: number): Promise<Regulation[]> {
    return this.db.query<Regulation>({
      text: `
        select *
        from regulations
        order by effective_date desc
        limit $1
      `,
      values: [limit]
    });
  }

  async listRegulationContexts(limit: number): Promise<RegulationContext[]> {
    const regs = await this.listLatestRegulations(limit);
    const contexts: RegulationContext[] = [];
    for (const reg of regs) {
      const limits = await this.listLimits(reg.id);
      contexts.push({
        regulation: reg as Regulation,
        limits
      });
    }
    return contexts;
  }

  async countRegulationViolations(
    tenantId: TenantID,
    regulationId: UUID
  ): Promise<RegulationViolationRow> {
    const rows = await this.db.query<RegulationViolationRow>({
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

  async listSupplierExposure(tenantId: TenantID): Promise<SupplierExposureRow[]> {
    return this.db.query<SupplierExposureRow>({
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

  async recordScenarioResult(payload: {
    tenantId: TenantID;
    regulationCode: string;
    deltas: RegulationScenarioDelta[];
    summary: ImpactSummary;
    vector: ImpactScenarioVectorEntry[];
    baseline?: ImpactScenarioPayload['baseline'];
    expiresAtIso?: string | null;
  }): Promise<void> {
    const payloadJson = JSON.stringify({
      recordedAtIso: new Date().toISOString(),
      regulationCode: payload.regulationCode,
      deltas: payload.deltas,
      summary: payload.summary,
      vector: payload.vector,
      baseline: payload.baseline,
      expiresAtIso: payload.expiresAtIso ?? null
    });
    await this.db.query({
      text: `insert into impact_scenarios (tenant_id, regulation_code, payload)
             values ($1, $2, $3::jsonb)`,
      values: [payload.tenantId, payload.regulationCode, payloadJson]
    });
  }

  private async findRegulationByCode(code: string): Promise<Regulation | null> {
    const rows = await this.db.query<Regulation>({
      text: `select * from regulations where code = $1 order by effective_date desc limit 1`,
      values: [code]
    });
    return rows[0] ?? null;
  }

  async listLimits(regulationId: UUID): Promise<RegulationLimit[]> {
    return this.db.query<RegulationLimit>({
      text: `
        select
          id,
          regulation_id as "regulationId",
          substance,
          limit_ppm as "limitPpm",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from regulation_limits
        where regulation_id = $1
      `,
      values: [regulationId]
    });
  }

  private async fetchComplianceRows(
    tenantId: TenantID,
    filters?: { bomIds?: UUID[]; supplierIds?: UUID[]; assemblyIds?: string[] }
  ): Promise<ComplianceStatusRow[]> {
    const { clause, values } = this.buildComplianceFilterClause(tenantId, filters);
    const rows = await this.db.query<DbComplianceStatusRow>({
      text: `
        select
          bom_id as "bomId",
          assembly_id as "assemblyId",
          part_number as "partNumber",
          supplier_id as "supplierId",
          status,
          valid_until as "validUntil",
          findings
        from v_compliance_status
        where tenant_id = $1
        ${clause}
      `,
      values
    });
    return rows.map((row) => this.mapComplianceStatusRow(row));
  }

  private buildComplianceFilterClause(
    tenantId: TenantID,
    filters?: { bomIds?: UUID[]; supplierIds?: UUID[]; assemblyIds?: string[] }
  ): { clause: string; values: unknown[] } {
    const values: unknown[] = [tenantId];
    let clause = '';
    if (filters?.bomIds && filters.bomIds.length > 0) {
      clause += `and bom_id = any($${values.length + 1}::uuid[])`;
      values.push(filters.bomIds);
    }
    if (filters?.supplierIds && filters.supplierIds.length > 0) {
      clause += ` and supplier_id = any($${values.length + 1}::uuid[])`;
      values.push(filters.supplierIds);
    }
    if (filters?.assemblyIds && filters.assemblyIds.length > 0) {
      clause += ` and assembly_id = any($${values.length + 1}::text[])`;
      values.push(filters.assemblyIds);
    }
    return { clause, values };
  }

  private mapComplianceStatusRow(row: DbComplianceStatusRow): ComplianceStatusRow {
    const findings = this.normalizeFindings(row.findings);
    return {
      bomId: row.bomId,
      assemblyId: row.assemblyId,
      partNumber: row.partNumber,
      supplierId: row.supplierId ?? null,
      status: row.status,
      validUntil: row.validUntil ?? null,
      findings
    };
  }

  private normalizeFindings(raw: unknown): ComplianceStatusRow['findings'] {
    if (!Array.isArray(raw)) {
      return undefined;
    }
    const normalized: NonNullable<ComplianceStatusRow['findings']> = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const candidate = entry as {
        substance?: unknown;
        ppm?: unknown;
        thresholdPpm?: unknown;
      };
      if (typeof candidate.substance !== 'string' || typeof candidate.ppm !== 'number') {
        continue;
      }
      let threshold: number | null | undefined;
      if (typeof candidate.thresholdPpm === 'number') {
        threshold = candidate.thresholdPpm;
      } else if (candidate.thresholdPpm === null) {
        threshold = null;
      }
      normalized.push({
        substance: candidate.substance,
        ppm: candidate.ppm,
        thresholdPpm: threshold
      });
    }
    return normalized.length > 0 ? normalized : undefined;
  }

  private mapImpactScenarioRow(row: DbImpactScenarioRow): ImpactScenarioRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      regulationCode: row.regulationCode,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      payload: this.normalizeScenarioPayload(row.payload, row.regulationCode)
    };
  }

  private normalizeScenarioPayload(
    payload: unknown,
    fallbackRegulationCode: string
  ): ImpactScenarioPayload {
    if (!payload || typeof payload !== 'object') {
      return {
        recordedAtIso: new Date().toISOString(),
        regulationCode: fallbackRegulationCode,
        deltas: [],
        vector: [],
        baseline: undefined,
        expiresAtIso: null
      };
    }
    const candidate = payload as Partial<ImpactScenarioPayload>;
    return {
      recordedAtIso:
        typeof candidate.recordedAtIso === 'string'
          ? candidate.recordedAtIso
          : new Date().toISOString(),
      regulationCode:
        typeof candidate.regulationCode === 'string'
          ? candidate.regulationCode
          : fallbackRegulationCode,
      deltas: this.normalizeDeltas(candidate.deltas),
      summary: candidate.summary,
      vector: this.normalizeScenarioVector(candidate.vector),
      baseline: this.normalizeScenarioBaseline(candidate.baseline),
      expiresAtIso:
        typeof candidate.expiresAtIso === 'string' || candidate.expiresAtIso === null
          ? candidate.expiresAtIso
          : null
    };
  }

  private normalizeDeltas(raw: unknown): RegulationScenarioDelta[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const normalized: RegulationScenarioDelta[] = [];
    for (const value of raw) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const candidate = value as Partial<RegulationScenarioDelta>;
      const beforeValid =
        candidate.before === 'COMPLIANT' || candidate.before === 'OVER_LIMIT';
      const afterValid =
        candidate.after === 'COMPLIANT' || candidate.after === 'OVER_LIMIT';
      if (
        typeof candidate.partNumber !== 'string' ||
        typeof candidate.assemblyId !== 'string' ||
        !beforeValid ||
        !afterValid
      ) {
        continue;
      }
      const before = candidate.before as RegulationScenarioDelta['before'];
      const after = candidate.after as RegulationScenarioDelta['after'];
      normalized.push({
        partNumber: candidate.partNumber,
        assemblyId: candidate.assemblyId,
        supplierId: candidate.supplierId ?? null,
        before,
        after
      });
    }
    return normalized;
  }

  private normalizeScenarioVector(raw: unknown): ImpactScenarioVectorEntry[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const normalized: ImpactScenarioVectorEntry[] = [];
    for (const value of raw) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const candidate = value as Partial<ImpactScenarioVectorEntry>;
      if (typeof candidate.substance !== 'string' || typeof candidate.limitPpm !== 'number') {
        continue;
      }
      normalized.push({
        substance: candidate.substance,
        limitPpm: candidate.limitPpm,
        baselineLimitPpm:
          typeof candidate.baselineLimitPpm === 'number' ? candidate.baselineLimitPpm : candidate.limitPpm
      });
    }
    return normalized;
  }

  private normalizeScenarioBaseline(
    raw: unknown
  ): ImpactScenarioPayload['baseline'] | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }
    const candidate = raw as ImpactScenarioPayload['baseline'];
    const limits = Array.isArray(candidate?.limits)
      ? candidate.limits
          .map((limit) =>
            limit && typeof limit === 'object' && typeof limit.substance === 'string' && typeof limit.limitPpm === 'number'
              ? { substance: limit.substance, limitPpm: limit.limitPpm }
              : null
          )
          .filter((value): value is { substance: string; limitPpm: number } => Boolean(value))
      : [];
    const result: ImpactScenarioPayload['baseline'] = {
      bomId: candidate?.bomId,
      limits,
      rowCount: typeof candidate?.rowCount === 'number' ? candidate.rowCount : undefined
    };
    return result;
  }

  private computeLatestCursor(row?: RiskDataFreshnessRow): string | null {
    if (!row) {
      return null;
    }
    const timestamps = [
      row.bomComponentsUpdatedAt,
      row.certificatesUpdatedAt,
      row.supplierUpdatedAt,
      row.scenarioUpdatedAt
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value));
    if (timestamps.length === 0) {
      return null;
    }
    const maxMs = Math.max(...timestamps);
    return new Date(maxMs).toISOString();
  }
}

interface DbComplianceStatusRow {
  bomId: UUID;
  assemblyId: string;
  partNumber: string;
  supplierId?: UUID | null;
  status: ComplianceStatusRow['status'];
  validUntil?: string | null;
  findings?: unknown;
}

interface DbImpactScenarioRow {
  id: UUID;
  tenantId: TenantID;
  regulationCode: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

interface RiskDataFreshnessRow {
  bomComponentsUpdatedAt?: string | null;
  certificatesUpdatedAt?: string | null;
  supplierUpdatedAt?: string | null;
  scenarioUpdatedAt?: string | null;
}

interface RegulationViolationRow {
  violationParts: number;
  totalParts: number;
}

interface SupplierExposureRow {
  supplierId: UUID | null;
  supplierName: string | null;
  incidents: number;
  exposure: number;
}
