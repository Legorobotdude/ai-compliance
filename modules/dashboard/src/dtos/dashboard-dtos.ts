import type { ComplianceStatusRow, TenantID, UUID } from '@certivo/lib-db';
import type {
  ImpactPredictResponse,
  ImpactScenarioRecord,
  RiskAnalyticsSnapshot,
  RiskDataFreshness,
  ImpactBaselineLimit
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
  impactOptions: ImpactOptions;
  riskDataFreshness: RiskDataFreshness;
  auditLogs: AuditLogEntryDto[];
  ingestionIssues: OpsIssueDto[];
  slaLeaderboard: SlaLeaderboardEntryDto[];
  workflowJobs: WorkflowJobDto[];
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

export type AuditLogCategory = 'COMPLIANCE' | 'SUPPLIER' | 'LLM' | 'WORKFLOW' | 'SYSTEM' | 'OTHER';

export interface AuditLogMeta {
  latencyMs?: number;
  outcome?: 'SUCCESS' | 'RETRY' | 'FAILED';
  dueAt?: string;
  status?: string;
  promptHash?: string;
  issuesSummary?: string;
  blockedParts?: number;
  findings?: number;
  validUntil?: string | null;
  docRef?: string;
  schema?: string;
  bomId?: string;
  supplierId?: string;
}

export interface AuditLogEntryDto {
  id: UUID;
  action: string;
  target: string;
  category: AuditLogCategory;
  summary: string;
  meta?: AuditLogMeta;
  createdAt: string;
}

export type WorkflowJobType = 'SUPPLIER_REQUEST' | 'INGESTION';

export type WorkflowJobStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'ESCALATED' | 'RETRYING';

export interface WorkflowJobMeta {
  supplierId?: UUID | null;
  supplierName?: string | null;
  requestStatus?: string | null;
  dueAt?: string | null;
  issueCode?: string | null;
  issueStatus?: string | null;
  issuePartNumber?: string | null;
}

export interface WorkflowJobDto {
  id: UUID;
  workflow: WorkflowJobType;
  status: WorkflowJobStatus;
  step: string;
  target: string;
  startedAt: string;
  updatedAt: string;
  meta?: WorkflowJobMeta;
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

export interface ImpactOptions {
  defaultRegulation: string;
  regulations: Array<{
    code: string;
    name: string;
    limits: ImpactBaselineLimit[];
  }>;
}
