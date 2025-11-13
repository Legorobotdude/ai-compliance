import type { ComplianceStatusRow, TenantID, UUID } from '@certivo/lib-db';
import type {
  ImpactPredictResponse,
  ImpactScenarioRecord,
  RiskAnalyticsSnapshot,
  RiskDataFreshness
} from '@certivo/risk-impact';

export interface DashboardSnapshotDto {
  tenantId: TenantID;
  bom: {
    id: UUID;
    productId: UUID;
    externalId: string;
    productName: string;
    uploadedAt: string;
    items: DashboardBomRow[];
    statusCounts: Record<ComplianceStatusRow['status'], number>;
  };
  suppliers: SupplierScorecardSnapshot[];
  risk: RiskAnalyticsSnapshot;
  impact: ImpactPredictResponse;
  impactHistory: ImpactScenarioRecord[];
  riskDataFreshness: RiskDataFreshness;
  auditLogs: AuditLogEntryDto[];
  ingestionIssues: OpsIssueDto[];
  slaLeaderboard: SlaLeaderboardEntryDto[];
}

export interface DashboardBomRow {
  bomId: UUID;
  assemblyId: string;
  assemblyName?: string | null;
  partNumber: string;
  supplierId?: UUID | null;
  supplierName?: string | null;
  status: ComplianceStatusRow['status'];
  validUntil?: string | null;
  findings: Array<{ substance: string; ppm: number | null; thresholdPpm?: number | null }>;
}

export interface SupplierScorecardSnapshot {
  supplierId: UUID;
  name: string;
  country: string;
  language: string;
  complianceRate: number;
  responseAvgDays: number;
  requestsOpen: number;
  slaTrend: number[];
  lastRequest?: string | null;
}

export interface AuditLogEntryDto {
  id: UUID;
  promptHash: string;
  model: string;
  latencyMs: number;
  outcome: 'SUCCESS' | 'RETRY' | 'FAILED';
  createdAt: string;
}

export interface OpsIssueDto {
  id: UUID;
  bomId?: UUID | null;
  assemblyId?: string | null;
  partNumber?: string | null;
  code: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  createdAt: string;
}

export interface SlaLeaderboardEntryDto {
  supplierId: UUID;
  supplierName: string;
  avgDays: number;
  slaTargetDays: number;
  openWorkflows: number;
  escalations: number;
}
