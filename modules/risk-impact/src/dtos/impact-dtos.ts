import type {
  ComplianceStatusRow,
  Regulation,
  RegulationLimit,
  RegulationScenarioDelta,
  TenantID,
  UUID
} from '@certivo/lib-db';

export interface ImpactLimitOverride {
  substance: string;
  limitPpm: number;
}

export interface ImpactScenarioVectorEntry extends ImpactLimitOverride {
  baselineLimitPpm: number;
}

export interface ImpactBaselineLimit {
  substance: string;
  limitPpm: number;
}

export interface ImpactRollupEntry {
  id: string;
  label?: string;
  impactedParts: number;
  beforeOverLimit: number;
  afterOverLimit: number;
}

export interface ImpactSummary {
  affectedParts: number;
  affectedSuppliers: number;
  affectedAssemblies: number;
}

export interface ImpactPredictRequest {
  tenantId: TenantID;
  regulationCode: string;
  newLimitPpm?: number;
  limitVector?: ImpactLimitOverride[];
  ttlMinutes?: number;
  bomId?: UUID;
}

export interface ImpactPredictResponse {
  regulation: string;
  oldLimitPpm: number;
  newLimitPpm: number;
  summary: ImpactSummary;
  deltas: RegulationScenarioDelta[];
  supplierRollups: ImpactRollupEntry[];
  assemblyRollups: ImpactRollupEntry[];
  vector: ImpactScenarioVectorEntry[];
  baselineLimits: ImpactBaselineLimit[];
  expiresAtIso?: string | null;
}

export interface RiskSnapshot {
  bomId: UUID;
  status: ComplianceStatusRow[];
}

export interface RegulationContext {
  regulation: Regulation;
  limits: RegulationLimit[];
}

export interface SupplierRiskStat {
  supplierId: UUID;
  name: string;
  country: string;
  language: string;
  complianceRate: number;
  responseAvgDays: number;
  openRequests: number;
  lastRequestAt?: string | null;
}

export interface ImpactScenarioPayload {
  recordedAtIso: string;
  regulationCode: string;
  deltas: RegulationScenarioDelta[];
  summary?: ImpactSummary;
  vector?: ImpactScenarioVectorEntry[];
  baseline?: {
    bomId?: UUID;
    limits: ImpactBaselineLimit[];
    rowCount?: number;
  };
  expiresAtIso?: string | null;
}

export interface ImpactScenarioRecord {
  id: UUID;
  tenantId: TenantID;
  regulationCode: string;
  payload: ImpactScenarioPayload;
  createdAt: string;
  updatedAt: string;
}

export interface RiskDataFreshness {
  bomComponentsUpdatedAt?: string | null;
  certificatesUpdatedAt?: string | null;
  supplierUpdatedAt?: string | null;
  scenarioUpdatedAt?: string | null;
  latestCursor?: string | null;
}
