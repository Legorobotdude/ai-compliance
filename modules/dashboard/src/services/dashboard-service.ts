import type { TenantID, UUID } from '@certivo/lib-db';
import type { ImpactPredictResponse } from '@certivo/risk-impact';
import { RiskImpactService } from '@certivo/risk-impact';
import type {
  DashboardSnapshotDto,
  DashboardBomRow,
  SupplierScorecardSnapshot,
  RiskSummaryDto,
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

const STATUS_ORDER = ['COMPLIANT', 'MISSING', 'EXPIRED', 'OVER_LIMIT'] as const;

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
    const [bomRows, statusCounts, suppliers, requestDurations, auditLogs, issues, exposureRows, regulations, slaAggregates] =
      await Promise.all([
        this.repository.fetchBomRows(tenantId, bomId),
        this.repository.fetchStatusCounts(tenantId, bomId),
        this.repository.listSuppliers(tenantId, this.supplierLimit),
        this.repository.listSupplierRequestDurations(tenantId),
        this.repository.listAuditLogs(tenantId, this.auditLogLimit),
        this.repository.listIngestionIssues(tenantId, this.issueLimit),
        this.repository.listSupplierExposure(tenantId),
        this.repository.listRegulations(3),
        this.repository.listSlaAggregates(tenantId)
      ]);

    const bomItems = this.mapBomRows(bomRows);
    const statusMap = this.normalizeStatusCounts(statusCounts);
    const supplierSnapshots = this.mapSuppliers(suppliers, requestDurations);
    const risk = await this.buildRiskSummary(tenantId, regulations, statusMap, exposureRows);
    const impact = await this.buildImpactPreview(tenantId, bomId);
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
    const slaLeaderboard = slaAggregates.map<SlaLeaderboardEntryDto>((row) => ({
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      avgDays: roundNumber(row.avgDays ?? 0),
      slaTargetDays: Math.max(1, Math.round(row.slaTargetDays ?? 5)),
      openWorkflows: row.openWorkflows,
      escalations: row.escalations
    }));

    return {
      tenantId,
      bom: {
        id: bomId,
        externalId: bomMeta.bomExternalId,
        productName: bomMeta.productName,
        uploadedAt: bomMeta.uploadedAt,
        items: bomItems,
        statusCounts: statusMap
      },
      suppliers: supplierSnapshots,
      risk,
      impact,
      auditLogs: auditEntries,
      ingestionIssues: opsIssues,
      slaLeaderboard
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

  private async buildRiskSummary(
    tenantId: TenantID,
    regulations: Awaited<ReturnType<DashboardRepository['listRegulations']>>,
    statusCounts: Record<DashboardBomRow['status'], number>,
    exposureRows: Awaited<ReturnType<DashboardRepository['listSupplierExposure']>>
  ): Promise<RiskSummaryDto> {
    const frameworks = [];
    for (const regulation of regulations) {
      const violationStats = await this.repository.countRegulationViolations(tenantId, regulation.id);
      const totalParts = violationStats.totalParts || 1;
      const violations = violationStats.violationParts ?? 0;
      const percent = Math.max(0, 1 - violations / totalParts);
      frameworks.push({
        code: regulation.code,
        name: regulation.name,
        percent: Number(percent.toFixed(2))
      });
    }

    const trend = this.buildRiskTrend(statusCounts);
    const supplierExposure = exposureRows
      .map((row) => ({
        supplierId: row.supplierId ?? ('00000000-0000-0000-0000-000000000000' as UUID),
        supplierName: row.supplierName ?? 'Unassigned',
        incidents: row.incidents,
        exposure: row.exposure
      }))
      .slice(0, 6);

    return {
      frameworks,
      trend,
      supplierExposure
    };
  }

  private buildRiskTrend(statusCounts: Record<DashboardBomRow['status'], number>) {
    const total = STATUS_ORDER.reduce((acc, status) => acc + (statusCounts[status] ?? 0), 0) || 1;
    const overLimit = statusCounts.OVER_LIMIT ?? 0;
    const expired = statusCounts.EXPIRED ?? 0;
    const missing = statusCounts.MISSING ?? 0;
    const riskPenalty = (overLimit * 2 + expired * 1.5 + missing) / total;
    const baseScore = clamp(95 - riskPenalty * 40, 45, 95);
    const adjustments = [-6, -3, -1, 0, 2, 4];
    return adjustments.map((delta, index) => ({
      label: `W${index + 1}`,
      score: Math.round(clamp(baseScore + delta, 40, 98))
    }));
  }

  private async buildImpactPreview(tenantId: TenantID, bomId: UUID): Promise<ImpactPredictResponse> {
    return this.riskService.predictImpact({
      tenantId,
      regulationCode: this.defaultImpactRegulation,
      newLimitPpm: this.defaultImpactLimitPpm,
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
