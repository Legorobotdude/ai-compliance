import type { ComplianceStatusRow, TenantID, UUID } from '@certivo/lib-db';
import type {
  ImpactLimitOverride,
  ImpactPredictRequest,
  ImpactPredictResponse,
  ImpactScenarioRecord,
  RegulationContext,
  RiskDataFreshness,
  FrameworkCoverageSlice,
  RiskAnalyticsRequest,
  RiskAnalyticsSnapshot,
  RiskScoreComponent,
  RiskScoreSummary,
  RiskScoreWeights,
  RiskTrendPoint,
  RiskSnapshot,
  SupplierGapSummary,
  SupplierExposurePoint,
  SupplierRiskStat
} from '../dtos/impact-dtos.js';
import { RiskRepository } from '../repositories/risk-repository';
import { evaluateImpactScenario } from './impact-evaluator.js';

const DEFAULT_SCENARIO_TTL_MINUTES = 60;
const DEFAULT_ANALYTICS_CACHE_TTL_MS = 30_000;
const DEFAULT_FRAMEWORK_LIMIT = 4;
const DEFAULT_SUPPLIER_EXPOSURE_LIMIT = 6;
const DEFAULT_GAP_LIMIT = 5;
const DEFAULT_TREND_POINTS = 6;
const EXPIRY_TARGET_DAYS = 90;
const RESPONSE_TARGET_DAYS = 10;
const DEFAULT_SCORE_WEIGHTS: RiskScoreWeights = {
  overLimit: 0.4,
  missingExpired: 0.25,
  expiryPressure: 0.2,
  supplierRisk: 0.15
};

export class RiskImpactService {
  private readonly analyticsCache = new Map<
    string,
    { expiresAt: number; snapshot: RiskAnalyticsSnapshot }
  >();

  constructor(private readonly repository: RiskRepository) {}

  async predictImpact(request: ImpactPredictRequest): Promise<ImpactPredictResponse> {
    const regulationContext = await this.getRegulationContext(request.regulationCode);
    const rows = await this.repository.fetchStatusRows(request.tenantId, request.bomId);
    const overrides = this.resolveLimitVector(request, regulationContext);
    const evaluation = evaluateImpactScenario({
      rows,
      overrides,
      regulationLimits: regulationContext.limits
    });
    const ttlMinutes = request.ttlMinutes ?? DEFAULT_SCENARIO_TTL_MINUTES;
    const expiresAt =
      ttlMinutes && ttlMinutes > 0
        ? new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
        : null;

    await this.repository.recordScenarioResult({
      tenantId: request.tenantId,
      regulationCode: request.regulationCode,
      deltas: evaluation.deltas,
      summary: evaluation.summary,
      vector: evaluation.vector,
      baseline: {
        bomId: request.bomId,
        limits: evaluation.baselineLimits,
        rowCount: rows.length
      },
      expiresAtIso: expiresAt
    });

    const primaryVector = evaluation.vector[0];
    const fallbackOldLimit =
      primaryVector?.baselineLimitPpm ??
      regulationContext.limits[0]?.limitPpm ??
      overrides[0]?.limitPpm ??
      request.newLimitPpm ??
      0;
    const fallbackNewLimit =
      primaryVector?.limitPpm ??
      overrides[0]?.limitPpm ??
      request.newLimitPpm ??
      fallbackOldLimit;

    return {
      regulation: regulationContext.regulation.code,
      oldLimitPpm: fallbackOldLimit,
      newLimitPpm: fallbackNewLimit,
      summary: evaluation.summary,
      deltas: evaluation.deltas,
      supplierRollups: evaluation.supplierRollups,
      assemblyRollups: evaluation.assemblyRollups,
      vector: evaluation.vector,
      baselineLimits: evaluation.baselineLimits,
      expiresAtIso: expiresAt
    };
  }

  async getRegulationContext(code: string): Promise<RegulationContext> {
    const context = await this.repository.loadRegulationContext(code);
    if (!context) {
      throw new Error(`Regulation ${code} not found`);
    }
    return context;
  }

  async fetchComplianceSnapshots(
    tenantId: TenantID,
    filters?: { bomIds?: UUID[] }
  ): Promise<RiskSnapshot[]> {
    return this.repository.fetchComplianceSnapshots(tenantId, filters);
  }

  async listSupplierRiskStats(tenantId: TenantID, supplierIds?: UUID[]): Promise<SupplierRiskStat[]> {
    return this.repository.listSupplierStats(tenantId, supplierIds);
  }

  async listRecentImpactScenarios(
    tenantId: TenantID,
    limit = 5
  ): Promise<ImpactScenarioRecord[]> {
    return this.repository.listRecentImpactScenarios(tenantId, limit);
  }

  async getRiskDataFreshness(tenantId: TenantID): Promise<RiskDataFreshness> {
    return this.repository.getRiskDataFreshness(tenantId);
  }

  async getRiskAnalyticsSnapshot(request: RiskAnalyticsRequest): Promise<RiskAnalyticsSnapshot> {
    const normalizedWeights = this.normalizeWeights(request.weights);
    const frameworkLimit = request.frameworkLimit ?? DEFAULT_FRAMEWORK_LIMIT;
    const supplierExposureLimit = request.supplierExposureLimit ?? DEFAULT_SUPPLIER_EXPOSURE_LIMIT;
    const gapLimit = request.gapLimit ?? DEFAULT_GAP_LIMIT;
    const trendPoints = request.trendPoints ?? DEFAULT_TREND_POINTS;
    const cacheKey = this.buildAnalyticsCacheKey({
      tenantId: request.tenantId,
      bomId: request.bomId,
      weights: normalizedWeights,
      frameworkLimit,
      supplierExposureLimit,
      gapLimit,
      trendPoints
    });
    const cached = this.analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }

    const [rows, supplierStats, regulations, exposureRows] = await Promise.all([
      this.repository.fetchStatusRows(request.tenantId, request.bomId),
      this.repository.listSupplierStats(request.tenantId),
      this.repository.listLatestRegulations(frameworkLimit),
      this.repository.listSupplierExposure(request.tenantId)
    ]);

    const [riskScore, frameworks] = await Promise.all([
      this.calculateRiskScore(rows, supplierStats, normalizedWeights),
      this.buildFrameworkCoverage(request.tenantId, regulations)
    ]);
    const trend = this.buildTrendSeries(riskScore.score, rows, trendPoints);
    const supplierExposure = this.buildSupplierExposure(exposureRows, supplierStats, supplierExposureLimit);
    const gaps = this.buildGapSummary(rows, supplierStats, gapLimit);

    const snapshot: RiskAnalyticsSnapshot = {
      tenantId: request.tenantId,
      bomId: request.bomId,
      generatedAt: new Date().toISOString(),
      riskScore,
      frameworks,
      trend,
      supplierExposure,
      gaps
    };

    this.analyticsCache.set(cacheKey, {
      expiresAt: Date.now() + DEFAULT_ANALYTICS_CACHE_TTL_MS,
      snapshot
    });

    return snapshot;
  }

  private resolveLimitVector(
    request: ImpactPredictRequest,
    context: RegulationContext
  ): ImpactLimitOverride[] {
    if (request.limitVector && request.limitVector.length > 0) {
      return request.limitVector;
    }
    const defaultSubstance = context.limits[0]?.substance ?? request.regulationCode;
    const normalizedDefault = defaultSubstance.toLowerCase();
    const fallbackLimit =
      request.newLimitPpm ??
      context.limits.find((limit) => limit.substance.toLowerCase() === normalizedDefault)?.limitPpm;
    const limitPpm = fallbackLimit ?? context.limits[0]?.limitPpm ?? 0;
    return [{ substance: defaultSubstance, limitPpm }];
  }

  private normalizeWeights(overrides?: Partial<RiskScoreWeights>): RiskScoreWeights {
    const merged: RiskScoreWeights = {
      ...DEFAULT_SCORE_WEIGHTS,
      ...overrides
    };
    const total = Object.values(merged).reduce((acc, value) => acc + value, 0);
    if (!total || Math.abs(total - 1) < 0.001) {
      return merged;
    }
    return {
      overLimit: merged.overLimit / total,
      missingExpired: merged.missingExpired / total,
      expiryPressure: merged.expiryPressure / total,
      supplierRisk: merged.supplierRisk / total
    };
  }

  private calculateRiskScore(
    rows: ComplianceStatusRow[],
    supplierStats: SupplierRiskStat[],
    weights: RiskScoreWeights
  ): RiskScoreSummary {
    const totalParts = rows.length || 1;
    const overLimitCount = rows.filter((row) => row.status === 'OVER_LIMIT').length;
    const missingExpiredCount = rows.filter(
      (row) => row.status === 'MISSING' || row.status === 'EXPIRED'
    ).length;
    const expirySamples = rows
      .map((row) => (row.validUntil ? this.daysUntil(row.validUntil) : null))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const avgExpiryDays =
      expirySamples.length > 0
        ? expirySamples.reduce((acc, value) => acc + value, 0) / expirySamples.length
        : null;
    const expiryPressure =
      avgExpiryDays == null
        ? 0.5
        : this.clamp((EXPIRY_TARGET_DAYS - avgExpiryDays) / EXPIRY_TARGET_DAYS, 0, 1);
    const supplierRisk = this.computeSupplierRiskPenalty(supplierStats);

    const overLimitRatio = overLimitCount / totalParts;
    const missingExpiredRatio = missingExpiredCount / totalParts;

    const penalty =
      overLimitRatio * weights.overLimit +
      missingExpiredRatio * weights.missingExpired +
      expiryPressure * weights.expiryPressure +
      supplierRisk * weights.supplierRisk;

    const score = Math.round(this.clamp(100 - penalty * 100, 0, 100));
    const components: RiskScoreComponent[] = [
      {
        id: 'overLimit',
        label: 'Over-limit parts',
        weight: weights.overLimit,
        normalizedValue: overLimitRatio,
        rawValue: overLimitCount,
        unit: 'ratio',
        penalty: overLimitRatio * weights.overLimit * 100
      },
      {
        id: 'missingExpired',
        label: 'Missing/expired',
        weight: weights.missingExpired,
        normalizedValue: missingExpiredRatio,
        rawValue: missingExpiredCount,
        unit: 'ratio',
        penalty: missingExpiredRatio * weights.missingExpired * 100
      },
      {
        id: 'expiryPressure',
        label: 'Time to expiry',
        weight: weights.expiryPressure,
        normalizedValue: expiryPressure,
        rawValue: avgExpiryDays ?? 0,
        unit: 'days',
        penalty: expiryPressure * weights.expiryPressure * 100
      },
      {
        id: 'supplierRisk',
        label: 'Supplier responsiveness',
        weight: weights.supplierRisk,
        normalizedValue: supplierRisk,
        rawValue: supplierRisk,
        unit: 'score',
        penalty: supplierRisk * weights.supplierRisk * 100
      }
    ];

    return {
      score,
      minScore: 0,
      maxScore: 100,
      components
    };
  }

  private async buildFrameworkCoverage(
    tenantId: TenantID,
    regulations: Awaited<ReturnType<RiskRepository['listLatestRegulations']>>
  ): Promise<FrameworkCoverageSlice[]> {
    const slices = await Promise.all(
      regulations.map(async (regulation) => {
        const stats = await this.repository.countRegulationViolations(tenantId, regulation.id);
        const totalParts = stats.totalParts || 1;
        const violations = stats.violationParts ?? 0;
        const percent = Math.max(0, 1 - violations / totalParts);
        return {
          code: regulation.code,
          name: regulation.name,
          percent: Number(percent.toFixed(2)),
          violations,
          totalParts
        };
      })
    );
    return slices;
  }

  private buildTrendSeries(
    score: number,
    rows: ComplianceStatusRow[],
    points: number
  ): RiskTrendPoint[] {
    const totalParts = rows.length || 1;
    const overLimit = rows.filter((row) => row.status === 'OVER_LIMIT').length;
    const missingExpired = rows.filter(
      (row) => row.status === 'MISSING' || row.status === 'EXPIRED'
    ).length;
    const stressRatio = (overLimit * 1.5 + missingExpired) / totalParts;
    const floor = this.clamp(score - Math.round(stressRatio * 40), 30, score);
    const delta = (score - floor) / Math.max(points - 1, 1);
    const trend: RiskTrendPoint[] = [];
    for (let index = 0; index < points; index += 1) {
      const value = Math.round(this.clamp(floor + delta * index, 25, 100));
      const prev = trend[index - 1]?.score;
      trend.push({
        label: `W${index + 1}`,
        score: value,
        delta: prev == null ? 0 : value - prev
      });
    }
    return trend;
  }

  private buildSupplierExposure(
    exposureRows: Awaited<ReturnType<RiskRepository['listSupplierExposure']>>,
    supplierStats: SupplierRiskStat[],
    limit: number
  ): SupplierExposurePoint[] {
    const statMap = new Map(supplierStats.map((stat) => [stat.supplierId, stat]));
    return exposureRows.slice(0, limit).map((row) => {
      const stat = row.supplierId ? statMap.get(row.supplierId) : undefined;
      return {
        supplierId: row.supplierId ?? null,
        supplierName: row.supplierName ?? 'Unassigned supplier',
        incidents: row.incidents,
        exposure: row.exposure,
        complianceRate: stat?.complianceRate,
        responseAvgDays: stat?.responseAvgDays
      };
    });
  }

  private buildGapSummary(
    rows: ComplianceStatusRow[],
    supplierStats: SupplierRiskStat[],
    limit: number
  ): SupplierGapSummary[] {
    const statMap = new Map(supplierStats.map((stat) => [stat.supplierId, stat]));
    const groups = new Map<
      string,
      {
        supplierId: UUID | null;
        missing: number;
        expired: number;
        overLimit: number;
        nextExpiryDays: number | null;
      }
    >();

    for (const row of rows) {
      const key = row.supplierId ?? 'UNASSIGNED';
      const existing =
        groups.get(key) ??
        {
          supplierId: row.supplierId ?? null,
          missing: 0,
          expired: 0,
          overLimit: 0,
          nextExpiryDays: null
        };
      if (row.status === 'MISSING') {
        existing.missing += 1;
      } else if (row.status === 'EXPIRED') {
        existing.expired += 1;
      } else if (row.status === 'OVER_LIMIT') {
        existing.overLimit += 1;
      }
      if (row.validUntil) {
        const days = this.daysUntil(row.validUntil);
        if (
          typeof days === 'number' &&
          Number.isFinite(days) &&
          (existing.nextExpiryDays == null || days < existing.nextExpiryDays)
        ) {
          existing.nextExpiryDays = days;
        }
      }
      groups.set(key, existing);
    }

    const summaries: SupplierGapSummary[] = Array.from(groups.values())
      .filter((group) => group.missing + group.expired + group.overLimit > 0)
      .map((group) => {
        const stat = group.supplierId ? statMap.get(group.supplierId) : undefined;
        const gapSeverity = group.overLimit * 2 + group.expired * 1.5 + group.missing;
        return {
          supplierId: group.supplierId,
          supplierName: stat?.name ?? (group.supplierId ? 'Unknown supplier' : 'Unassigned supplier'),
          missing: group.missing,
          expired: group.expired,
          overLimit: group.overLimit,
          nextExpiryDays: group.nextExpiryDays,
          responseAvgDays: stat?.responseAvgDays,
          complianceRate: stat?.complianceRate,
          gapSeverity
        };
      })
      .sort((a, b) => b.gapSeverity - a.gapSeverity)
      .slice(0, limit);

    return summaries;
  }

  private computeSupplierRiskPenalty(stats: SupplierRiskStat[]): number {
    if (!stats.length) {
      return 0.5;
    }
    const avgCompliance =
      stats.reduce((acc, stat) => acc + this.clamp(stat.complianceRate ?? 0, 0, 1), 0) / stats.length;
    const avgResponse =
      stats.reduce((acc, stat) => acc + (stat.responseAvgDays ?? RESPONSE_TARGET_DAYS), 0) / stats.length;
    const complianceGap = 1 - avgCompliance;
    const responsePenalty = this.clamp(avgResponse / RESPONSE_TARGET_DAYS, 0, 1.2);
    return this.clamp(complianceGap * 0.6 + responsePenalty * 0.4, 0, 1);
  }

  private daysUntil(value: string): number | null {
    const target = Date.parse(value);
    if (!Number.isFinite(target)) {
      return null;
    }
    const diffMs = target - Date.now();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private buildAnalyticsCacheKey(input: {
    tenantId: TenantID;
    bomId?: UUID;
    weights: RiskScoreWeights;
    frameworkLimit: number;
    supplierExposureLimit: number;
    gapLimit: number;
    trendPoints: number;
  }): string {
    return [
      input.tenantId,
      input.bomId ?? 'ALL',
      input.frameworkLimit,
      input.supplierExposureLimit,
      input.gapLimit,
      input.trendPoints,
      input.weights.overLimit.toFixed(3),
      input.weights.missingExpired.toFixed(3),
      input.weights.expiryPressure.toFixed(3),
      input.weights.supplierRisk.toFixed(3)
    ].join('|');
  }
}
