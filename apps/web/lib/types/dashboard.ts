import type { DashboardSnapshotDto } from '@certivo/dashboard';

export type DashboardSnapshot = DashboardSnapshotDto;
export type DashboardBomRow = DashboardSnapshot['bom']['items'][number];
export type SupplierSnapshot = DashboardSnapshot['suppliers'][number];
export type RiskSummary = DashboardSnapshot['risk'];
export type AuditLogEntry = DashboardSnapshot['auditLogs'][number];
export type OpsIssue = DashboardSnapshot['ingestionIssues'][number];
export type SlaLeaderboardEntry = DashboardSnapshot['slaLeaderboard'][number];
export type WorkflowJob = DashboardSnapshot['workflowJobs'][number];
