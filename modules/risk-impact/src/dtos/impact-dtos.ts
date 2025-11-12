import type {
  ComplianceStatusRow,
  Regulation,
  RegulationLimit,
  RegulationScenarioDelta,
  TenantID,
  UUID
} from '@certivo/lib-db';

export interface ImpactPredictRequest {
  tenantId: TenantID;
  regulationCode: string;
  newLimitPpm: number;
  bomId?: UUID;
}

export interface ImpactPredictResponse {
  regulation: string;
  oldLimitPpm: number;
  newLimitPpm: number;
  summary: {
    affectedParts: number;
    affectedSuppliers: number;
    affectedAssemblies: number;
  };
  deltas: RegulationScenarioDelta[];
}

export interface RiskSnapshot {
  bomId: UUID;
  status: ComplianceStatusRow[];
}

export interface RegulationContext {
  regulation: Regulation;
  limits: RegulationLimit[];
}
