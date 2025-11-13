import type { TenantID, UUID } from '@certivo/lib-db';
import type { ImpactPredictResponse } from '@certivo/risk-impact';
import { RiskImpactService } from '@certivo/risk-impact';
import type {
  DashboardSnapshotDto,
  DashboardBomRow,
  SupplierScorecardSnapshot,
  AuditLogEntryDto,
  OpsIssueDto,
  SlaLeaderboardEntryDto
} from '../dtos/dashboard-dtos';
import { DashboardRepository } from '../repositories/dashboard-repository';

export interface DashboardServiceOptions {
  supplierLimit?: number;
  auditLogLimit?: number;
  issueLimit?: number;
  defaultImpactRegulation?: string;
  defaultImpactLimitPpm?: number;
}

export class DashboardService {
  private readonly supplierLimit: number;
  private readonly auditLogLimit: number;
  private readonly issueLimit: number;
  private readonly defaultImpactRegulation: string;
  private readonly defaultImpactLimitPpm: number;

  constructor(
    private readonly repository: DashboardRepository,
    private readonly riskService: RiskImpactService,
    options?: DashboardServiceOptions
  ) {
    this.supplierLimit = options?.supplierLimit ?? 5;
    this.auditLogLimit = options?.auditLogLimit ?? 10;
    this.issueLimit = options?.issueLimit ?? 8;
    this.defaultImpactRegulation = options?.defaultImpactRegulation ?? 'PFAS';
    this.defaultImpactLimitPpm = options?.defaultImpactLimitPpm ?? 100;
  }

  async getSnapshot(params: { tenantId: TenantID; bomId?: UUID }): Promise<DashboardSnapshotDto> {
    const { tenantId } = params;
    const bomMeta =
      params.bomId != null
        ? await this.repository.findBomById(tenantId, params.bomId)
        : await this.repository.findLatestBom(tenantId);

    if (!bomMeta) {
      throw new Error('No BOMs found for tenant; ingest data before requesting dashboard snapshot.');
    }

    const bomId = params.bomId ?? bomMeta.id;
    const [bomRows, statusCounts, suppliers, requestDurations, auditLogs, issues, slaAggregates] =
      await Promise.all([
      this.repository.fetchBomRows(tenantId, bomId),
      this.repository.fetchStatusCounts(tenantId, bomId),
      this.repository.listSuppliers(tenantId, this.supplierLimit),
      this.repository.listSupplierRequestDurations(tenantId),
      this.repository.listAuditLogs(tenantId, this.auditLogLimit),
      this.repository.listIngestionIssues(tenantId, this.issueLimit),
      this.repository.listSlaAggregates(tenantId)
      ]);

    const bomItems = this.mapBomRows(bomRows);
    const statusMap = this.normalizeStatusCounts(statusCounts);
    const supplierSnapshots = this.mapSuppliers(suppliers, requestDurations);
    const [risk, impact, impactHistory, riskDataFreshness] = await Promise.all([
      this.riskService.getRiskAnalyticsSnapshot({
        tenantId,
        bomId,
        frameworkLimit: 4,
        supplierExposureLimit: 6,
        gapLimit: 4,
        trendPoints: 6
      }),
      this.buildImpactPreview(tenantId, bomId),
      this.riskService.listRecentImpactScenarios(tenantId, 5),
      this.riskService.getRiskDataFreshness(tenantId)
    ]);
    const auditEntries = auditLogs.map<AuditLogEntryDto>((log) => ({
      id: log.id,
      promptHash: log.promptHash,
      model: log.model,
      latencyMs: log.latencyMs,
      outcome: log.outcome,
      createdAt: log.createdAt
    }));
    const opsIssues = issues.map<OpsIssueDto>((issue) => ({
      id: issue.id,
      bomId: issue.bomId,
      assemblyId: issue.assemblyId,
      partNumber: issue.partNumber,
      code: issue.code,
      severity: mapIssueSeverity(issue.code, issue.status),
      message: issue.message,
      createdAt: issue.createdAt
    }));
    const slaLeaderboard = slaAggregates.map<SlaLeaderboardEntryDto>((row) => {
      const avgDaysValue = row.avgDays == null ? 0 : Number(row.avgDays);
      const slaTargetValue = row.slaTargetDays == null ? undefined : Number(row.slaTargetDays);
      return {
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        avgDays: roundNumber(avgDaysValue),
        slaTargetDays: Math.max(1, Math.round(slaTargetValue ?? 5)),
        openWorkflows: row.openWorkflows,
        escalations: row.escalations
      };
    });

    return {
      tenantId,
      bom: {
        id: bomId,
        productId: bomMeta.productId,
        externalId: bomMeta.bomExternalId,
        productName: bomMeta.productName,
        uploadedAt: bomMeta.uploadedAt,
        items: bomItems,
        statusCounts: statusMap
      },
      suppliers: supplierSnapshots,
      risk,
      impact,
      impactHistory,
      auditLogs: auditEntries,
      ingestionIssues: opsIssues,
      slaLeaderboard,
      riskDataFreshness
    };
  }

  private mapBomRows(rows: Awaited<ReturnType<DashboardRepository['fetchBomRows']>>): DashboardBomRow[] {
    return rows.map((row) => ({
      bomId: row.bomId,
      assemblyId: row.assemblyId,
      assemblyName: row.assemblyName,
      partNumber: row.partNumber,
      supplierId: row.supplierId ?? undefined,
      supplierName: row.supplierName ?? undefined,
      status: row.status,
      validUntil: row.validUntil ?? undefined,
      findings: Array.isArray(row.findings)
        ? row.findings.map((finding) => ({
            substance: finding.substance,
            ppm: typeof finding.ppm === 'number' ? finding.ppm : null,
            thresholdPpm:
              finding.thresholdPpm == null ? undefined : (finding.thresholdPpm as number | null)
          }))
        : []
    }));
  }

  private normalizeStatusCounts(statusCounts: Awaited<ReturnType<DashboardRepository['fetchStatusCounts']>>) {
    const counts: Record<DashboardBomRow['status'], number> = {
      COMPLIANT: 0,
      MISSING: 0,
      EXPIRED: 0,
      OVER_LIMIT: 0
    };
    for (const item of statusCounts) {
      counts[item.status] = Number(item.count ?? 0);
    }
    return counts;
  }

  private mapSuppliers(
    suppliers: Awaited<ReturnType<DashboardRepository['listSuppliers']>>,
    durations: Awaited<ReturnType<DashboardRepository['listSupplierRequestDurations']>>
  ): SupplierScorecardSnapshot[] {
    const durationMap = new Map<UUID, number[]>();
    for (const duration of durations) {
      if (!duration.supplierId || duration.durationDays == null) {
        continue;
      }
      const arr = durationMap.get(duration.supplierId) ?? [];
      arr.push(duration.durationDays);
      durationMap.set(duration.supplierId, arr);
    }

    return suppliers.map((supplier) => {
      const trendSource = durationMap.get(supplier.id) ?? [];
      const sorted = [...trendSource].sort((a, b) => a - b);
      const lastSix = sorted.slice(-6);
      const fillValue = supplier.responseAvgDays ?? (lastSix.length ? average(lastSix) : 0);
      while (lastSix.length < 6) {
        lastSix.unshift(fillValue);
      }
      return {
        supplierId: supplier.id,
        name: supplier.name,
        country: supplier.country,
        language: supplier.language,
        complianceRate: Number(supplier.complianceRate ?? 0),
        responseAvgDays: Number(supplier.responseAvgDays ?? 0),
        requestsOpen: supplier.requestsOpen,
        slaTrend: lastSix.map((value) => roundNumber(value)),
        lastRequest: supplier.lastRequestAt ?? undefined
      };
    });
  }

  private async buildImpactPreview(tenantId: TenantID, bomId: UUID): Promise<ImpactPredictResponse> {
    return this.riskService.predictImpact({
      tenantId,
      regulationCode: this.defaultImpactRegulation,
      limitVector: [{ substance: this.defaultImpactRegulation, limitPpm: this.defaultImpactLimitPpm }],
      bomId
    });
  }
}

function mapIssueSeverity(code: string, status: string): OpsIssueDto['severity'] {
  if (code === 'SUPPLIER_MISSING' || code === 'VALUE_MISSING') {
    return 'critical';
  }
  if (code === 'UNIT_MISSING') {
    return 'warning';
  }
  if (status === 'IN_PROGRESS') {
    return 'warning';
  }
  return 'info';
}

function roundNumber(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}
