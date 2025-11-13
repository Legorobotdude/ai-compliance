import type { TenantID, UUID } from '@certivo/lib-db';
import type {
  ImpactLimitOverride,
  ImpactPredictRequest,
  ImpactPredictResponse,
  ImpactScenarioRecord,
  RegulationContext,
  RiskDataFreshness,
  RiskSnapshot,
  SupplierRiskStat
} from '../dtos/impact-dtos.js';
import { RiskRepository } from '../repositories/risk-repository';
import { evaluateImpactScenario } from './impact-evaluator.js';

const DEFAULT_SCENARIO_TTL_MINUTES = 60;

export class RiskImpactService {
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
}
