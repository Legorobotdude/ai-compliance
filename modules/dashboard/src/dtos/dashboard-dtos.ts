import type { ComplianceStatusRow, TenantID, UUID } from '@certivo/lib-db';
import type { ImpactPredictResponse } from '@certivo/risk-impact';

export interface DashboardSnapshotDto {
  tenantId: TenantID;
  bom: {
    id: UUID;
    externalId: string;
    productName: string;
    uploadedAt: string;
    items: DashboardBomRow[];
    statusCounts: Record<ComplianceStatusRow['status'], number>;
  };
  suppliers: SupplierScorecardSnapshot[];
  risk: RiskSummaryDto;
  impact: ImpactPredictResponse;
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

export interface RiskSummaryDto {
  frameworks: Array<{ code: string; name: string; percent: number }>;
  trend: Array<{ label: string; score: number }>;
  supplierExposure: Array<{ supplierId: UUID; supplierName: string; incidents: number; exposure: number }>;
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
