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
    const auditEntries = auditLogs.map((log) => this.mapAuditLogEntry(log));
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

  private mapAuditLogEntry(
    log: Awaited<ReturnType<DashboardRepository['listAuditLogs']>>[number]
  ): AuditLogEntryDto {
    const category = this.resolveAuditCategory(log.action);
    const { summary, meta } = this.buildAuditSummary(log);
    return {
      id: log.id,
      action: log.action,
      target: log.target,
      category,
      summary,
      meta,
      createdAt: log.createdAt
    };
  }

  private resolveAuditCategory(action: string): AuditLogEntryDto['category'] {
    const normalized = action.toLowerCase();
    if (normalized.startsWith('compliance') || normalized.startsWith('document')) {
      return 'COMPLIANCE';
    }
    if (
      normalized.includes('supplier.email') ||
      normalized.includes('supplier_email') ||
      normalized.includes('llm') ||
      normalized.includes('risk')
    ) {
      return 'LLM';
    }
    if (normalized.startsWith('supplier.request')) {
      return 'WORKFLOW';
    }
    if (normalized.startsWith('supplier')) {
      return 'SUPPLIER';
    }
    if (normalized.includes('workflow')) {
      return 'WORKFLOW';
    }
    return 'OTHER';
  }

  private buildAuditSummary(
    log: Awaited<ReturnType<DashboardRepository['listAuditLogs']>>[number]
  ): { summary: string; meta?: AuditLogEntryDto['meta'] } {
    const payload = (log.payload ?? {}) as Record<string, unknown>;
    const getString = (...keys: string[]): string | undefined => {
      for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string') {
          return value;
        }
      }
      return undefined;
    };
    const getNumber = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'number') {
          return value;
        }
      }
      return undefined;
    };
    const getArrayLength = (key: string): number | undefined => {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value.length;
      }
      return undefined;
    };

    switch (log.action) {
      case 'COMPLIANCE_BOM_UPLOADED': {
        const assemblies = getNumber('assemblies', 'assemblyCount');
        const components = getNumber('components', 'componentCount');
        const issuesSummary = this.describeIssueSummary(payload['issues']);
        const summary = `BOM upload captured ${assemblies ?? '—'} assemblies and ${components ?? '—'} components`;
        return {
          summary: issuesSummary ? `${summary} · Issues ${issuesSummary}` : summary,
          meta: issuesSummary ? { issuesSummary } : undefined
        };
      }
      case 'COMPLIANCE_CERT_UPLOADED': {
        const partNumber = getString('partNumber');
        const findings = getNumber('findings');
        const validUntil = getString('validUntil');
        const supplierId = getString('supplierId');
        return {
          summary: `Certificate recorded for ${partNumber ?? 'part'} (${findings ?? 0} findings)`,
          meta: {
            findings: findings ?? 0,
            validUntil: validUntil ?? null,
            supplierId
          }
        };
      }
      case 'DOCUMENT_PARSED': {
        const schema = getString('schema');
        const docRef = getString('doc_ref', 'docRef');
        return {
          summary: `Document parsed via schema ${schema ?? 'unknown'}`,
          meta: {
            schema,
            docRef
          }
        };
      }
      case 'SUPPLIER_EMAIL_DRAFTED': {
        const bomId = getString('bom_id', 'bomId');
        const dueAt = getString('due_date', 'dueAt');
        return {
          summary: `CORA drafted supplier email${bomId ? ` for BOM ${bomId}` : ''}`,
          meta: { bomId, dueAt }
        };
      }
      case 'RISK_SUMMARY_GENERATED': {
        const bomId = getString('bom_id', 'bomId');
        return {
          summary: `Risk summary generated${bomId ? ` for BOM ${bomId}` : ''}`,
          meta: { bomId }
        };
      }
      case 'supplier.request.created': {
        const requestId = getString('requestId') ?? log.target;
        const dueAt = getString('dueAt');
        const blockedParts = getArrayLength('blockedParts');
        return {
          summary: `Supplier request ${requestId} created${dueAt ? ` (due ${dueAt})` : ''}`,
          meta: { dueAt, blockedParts }
        };
      }
      case 'supplier.request.status.sent':
      case 'supplier.request.status.reminder':
      case 'supplier.request.status.escalated':
      case 'supplier.request.status.responded':
      case 'supplier.request.status.closed': {
        const requestId = getString('requestId') ?? log.target;
        const status = getString('status') ?? log.action.split('.').pop()?.toUpperCase();
        return {
          summary: `Supplier request ${requestId} marked ${status ?? 'updated'}`,
          meta: { status }
        };
      }
      case 'supplier.email.llm_recorded': {
        const bomId = getString('bomId');
        const dueAt = getString('dueAt');
        const latencyMs = getNumber('latencyMs');
        const promptHash = getString('promptHash');
        return {
          summary: `Supplier email LLM call completed${latencyMs != null ? ` in ${latencyMs} ms` : ''}${
            bomId ? ` (BOM ${bomId})` : ''
          }`,
          meta: {
            latencyMs,
            promptHash,
            dueAt,
            bomId,
            outcome: 'SUCCESS'
          }
        };
      }
    }

    const normalizedAction = log.action.replace(/_/g, ' ');
    return { summary: normalizedAction.charAt(0).toUpperCase() + normalizedAction.slice(1) };
  }

  private describeIssueSummary(raw: unknown): string | undefined {
    if (!raw || typeof raw !== 'object') {
      return undefined;
    }
    const entries = Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'number')
      .map(([code, value]) => `${code}:${value as number}`);
    if (!entries.length) {
      return undefined;
    }
    return entries.slice(0, 3).join(', ');
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
