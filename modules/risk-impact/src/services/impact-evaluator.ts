import type {
  ComplianceStatusRow,
  RegulationLimit,
  RegulationScenarioDelta
} from '@certivo/lib-db';
import type {
  ImpactBaselineLimit,
  ImpactLimitOverride,
  ImpactRollupEntry,
  ImpactScenarioVectorEntry,
  ImpactSummary
} from '../dtos/impact-dtos.js';

export interface ImpactEvaluationInput {
  rows: ComplianceStatusRow[];
  overrides: ImpactLimitOverride[];
  regulationLimits: RegulationLimit[];
}

export interface ImpactEvaluationResult {
  deltas: RegulationScenarioDelta[];
  summary: ImpactSummary;
  supplierRollups: ImpactRollupEntry[];
  assemblyRollups: ImpactRollupEntry[];
  vector: ImpactScenarioVectorEntry[];
  baselineLimits: ImpactBaselineLimit[];
}

const UNASSIGNED_SUPPLIER_ID = 'UNASSIGNED';

export function evaluateImpactScenario(input: ImpactEvaluationInput): ImpactEvaluationResult {
  const regulationMap = buildLimitMap(input.regulationLimits);
  const overrideMap = buildLimitMap(input.overrides);
  const baselineLimits = input.regulationLimits.map<ImpactBaselineLimit>((limit) => ({
    substance: limit.substance,
    limitPpm: limit.limitPpm
  }));
  const vector = buildScenarioVector(input.overrides, regulationMap);

  const deltas: RegulationScenarioDelta[] = [];
  for (const row of input.rows) {
    const findings = row.findings ?? [];
    if (!findings.length) {
      continue;
    }
    const before = evaluateStatus(findings, (substance, threshold) =>
      resolveBaselineLimit(substance, threshold, regulationMap)
    );
    const after = evaluateStatus(findings, (substance, threshold) =>
      resolveScenarioLimit(substance, threshold, regulationMap, overrideMap)
    );
    if (before === after) {
      continue;
    }
    deltas.push({
      partNumber: row.partNumber,
      assemblyId: row.assemblyId,
      supplierId: row.supplierId ?? null,
      before,
      after
    });
  }

  const summary: ImpactSummary = {
    affectedParts: deltas.length,
    affectedSuppliers: new Set(
      deltas.map((delta) => delta.supplierId).filter((value): value is string => Boolean(value))
    ).size,
    affectedAssemblies: new Set(deltas.map((delta) => delta.assemblyId)).size
  };

  return {
    deltas,
    summary,
    supplierRollups: buildRollups(deltas, 'supplier'),
    assemblyRollups: buildRollups(deltas, 'assembly'),
    vector,
    baselineLimits
  };
}

type LimitResolver = (substance: string, threshold?: number | null) => number;

function evaluateStatus(
  findings: NonNullable<ComplianceStatusRow['findings']>,
  limitResolver: LimitResolver
): 'COMPLIANT' | 'OVER_LIMIT' {
  for (const finding of findings) {
    const limit = limitResolver(finding.substance, finding.thresholdPpm);
    if (!Number.isFinite(limit)) {
      continue;
    }
    if (finding.ppm > limit) {
      return 'OVER_LIMIT';
    }
  }
  return 'COMPLIANT';
}

function resolveBaselineLimit(
  substance: string,
  threshold: number | null | undefined,
  regulationMap: Map<string, number>
): number {
  if (typeof threshold === 'number') {
    return threshold;
  }
  const normalized = normalizeSubstance(substance);
  const regulationLimit = regulationMap.get(normalized);
  return typeof regulationLimit === 'number' ? regulationLimit : Number.POSITIVE_INFINITY;
}

function resolveScenarioLimit(
  substance: string,
  threshold: number | null | undefined,
  regulationMap: Map<string, number>,
  overrideMap: Map<string, number>
): number {
  const baseline = resolveBaselineLimit(substance, threshold, regulationMap);
  const override = overrideMap.get(normalizeSubstance(substance));
  if (typeof override !== 'number') {
    return baseline;
  }
  if (!Number.isFinite(baseline)) {
    return override;
  }
  return Math.min(baseline, override);
}

function buildRollups(
  deltas: RegulationScenarioDelta[],
  kind: 'supplier' | 'assembly'
): ImpactRollupEntry[] {
  const map = new Map<string, ImpactRollupEntry>();
  for (const delta of deltas) {
    const key = kind === 'supplier' ? delta.supplierId ?? UNASSIGNED_SUPPLIER_ID : delta.assemblyId;
    if (!key) {
      continue;
    }
    const existing = map.get(key);
    if (existing) {
      existing.impactedParts += 1;
      if (delta.before === 'OVER_LIMIT') {
        existing.beforeOverLimit += 1;
      }
      if (delta.after === 'OVER_LIMIT') {
        existing.afterOverLimit += 1;
      }
      continue;
    }
    map.set(key, {
      id: key,
      label: kind === 'supplier' && key === UNASSIGNED_SUPPLIER_ID ? 'Unassigned supplier' : undefined,
      impactedParts: 1,
      beforeOverLimit: delta.before === 'OVER_LIMIT' ? 1 : 0,
      afterOverLimit: delta.after === 'OVER_LIMIT' ? 1 : 0
    });
  }
  return Array.from(map.values()).sort((a, b) => b.impactedParts - a.impactedParts);
}

function buildScenarioVector(
  overrides: ImpactLimitOverride[],
  regulationMap: Map<string, number>
): ImpactScenarioVectorEntry[] {
  return overrides.map((entry) => {
    const normalized = normalizeSubstance(entry.substance);
    const baseline = regulationMap.get(normalized);
    return {
      substance: entry.substance,
      limitPpm: entry.limitPpm,
      baselineLimitPpm: typeof baseline === 'number' ? baseline : entry.limitPpm
    };
  });
}

function buildLimitMap<T extends { substance: string; limitPpm: number }>(limits: T[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const limit of limits) {
    const normalized = normalizeSubstance(limit.substance);
    if (!normalized) {
      continue;
    }
    map.set(normalized, limit.limitPpm);
  }
  return map;
}

function normalizeSubstance(substance: string): string {
  return substance.trim().toUpperCase();
}
