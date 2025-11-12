import type { ComplianceStatusRow, RegulationScenarioDelta } from '@certivo/lib-db';
import type { ImpactPredictRequest, ImpactPredictResponse } from '../dtos/impact-dtos';
import { RiskRepository } from '../repositories/risk-repository';

export class RiskImpactService {
  constructor(private readonly repository: RiskRepository) {}

  async predictImpact(request: ImpactPredictRequest): Promise<ImpactPredictResponse> {
    const regulation = await this.repository.findRegulationByCode(request.regulationCode);
    if (!regulation) {
      throw new Error(`Regulation ${request.regulationCode} not found`);
    }
    const limits = await this.repository.listLimits(regulation.id);
    const baselineLimit = limits[0]?.limitPpm ?? request.newLimitPpm;
    const rows = await this.repository.fetchStatusRows(request.tenantId, request.bomId);

    const deltas = this.calculateDeltas(rows, baselineLimit, request.newLimitPpm);
    await this.repository.recordScenarioResult({
      tenantId: request.tenantId,
      regulationCode: request.regulationCode,
      deltas
    });

    const affectedParts = new Set(deltas.map((d) => d.partNumber)).size;
    const affectedSuppliers = new Set(deltas.map((d) => d.supplierId).filter(Boolean)).size;
    const affectedAssemblies = new Set(deltas.map((d) => d.assemblyId)).size;

    return {
      regulation: regulation.code,
      oldLimitPpm: baselineLimit,
      newLimitPpm: request.newLimitPpm,
      summary: { affectedParts, affectedSuppliers, affectedAssemblies },
      deltas
    };
  }

  private calculateDeltas(
    rows: ComplianceStatusRow[],
    oldLimit: number,
    newLimit: number
  ): RegulationScenarioDelta[] {
    return rows
      .flatMap((row) => {
        const findings = row.findings ?? [];
        const isOverOld = findings.some((finding) => (finding.thresholdPpm ?? oldLimit) < finding.ppm);
        const isOverNew = findings.some((finding) => newLimit < finding.ppm);
        if (isOverOld === isOverNew) {
          return [];
        }
        const before: 'COMPLIANT' | 'OVER_LIMIT' = isOverOld ? 'OVER_LIMIT' : 'COMPLIANT';
        const after: 'COMPLIANT' | 'OVER_LIMIT' = isOverNew ? 'OVER_LIMIT' : 'COMPLIANT';
        return [
          {
            partNumber: row.partNumber,
            supplierId: row.supplierId,
            assemblyId: row.assemblyId,
            before,
            after
          }
        ];
      });
  }
}
