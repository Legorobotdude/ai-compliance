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

export type RiskScoreComponentId =
  | 'overLimit'
  | 'missingExpired'
  | 'expiryPressure'
  | 'supplierRisk';

export interface RiskScoreWeights {
  overLimit: number;
  missingExpired: number;
  expiryPressure: number;
  supplierRisk: number;
}

export interface RiskScoreComponent {
  id: RiskScoreComponentId;
  label: string;
  weight: number;
  normalizedValue: number;
  rawValue: number;
  unit: 'ratio' | 'days' | 'score';
  penalty: number;
}

export interface RiskScoreSummary {
  score: number;
  minScore: number;
  maxScore: number;
  components: RiskScoreComponent[];
}

export interface FrameworkCoverageSlice {
  code: string;
  name: string;
  percent: number;
  violations: number;
  totalParts: number;
}

export interface RiskTrendPoint {
  label: string;
  score: number;
  delta?: number;
}

export interface SupplierExposurePoint {
  supplierId: UUID | null;
  supplierName: string;
  incidents: number;
  exposure: number;
  complianceRate?: number;
  responseAvgDays?: number;
}

export interface SupplierGapSummary {
  supplierId: UUID | null;
  supplierName: string;
  missing: number;
  expired: number;
  overLimit: number;
  nextExpiryDays?: number | null;
  responseAvgDays?: number;
  complianceRate?: number;
  gapSeverity: number;
}

export interface RiskAnalyticsSnapshot {
  tenantId: TenantID;
  bomId?: UUID;
  generatedAt: string;
  riskScore: RiskScoreSummary;
  frameworks: FrameworkCoverageSlice[];
  trend: RiskTrendPoint[];
  supplierExposure: SupplierExposurePoint[];
  gaps: SupplierGapSummary[];
}

export interface RiskAnalyticsRequest {
  tenantId: TenantID;
  bomId?: UUID;
  weights?: Partial<RiskScoreWeights>;
  frameworkLimit?: number;
  supplierExposureLimit?: number;
  gapLimit?: number;
  trendPoints?: number;
}
