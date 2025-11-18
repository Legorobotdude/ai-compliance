import type { IngestionIssue, UUID } from '@certivo/lib-db';
import type { Logger } from '@certivo/lib-logging';
import type { IngestionRetryTrigger } from '../dtos/workflow-dtos.js';
import { WorkflowRepository } from '../repositories/workflow-repository.js';

export interface IngestionRetryActivities {
  markIssueQueued(trigger: IngestionRetryTrigger): Promise<void>;
  performRetry(trigger: IngestionRetryTrigger): Promise<void>;
  resolveIssue(trigger: IngestionRetryTrigger): Promise<void>;
}

export interface IngestionActivityDeps {
  repo: WorkflowRepository;
  logger: Logger;
}

export function createIngestionRetryActivities(deps: IngestionActivityDeps): IngestionRetryActivities {
  return {
    async markIssueQueued(trigger) {
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'INGESTION', {
        event: 'IngestionRetryWorkflow.QUEUED',
        trigger
      });
      deps.logger.info({ trigger }, 'workflow.ingestion.queued');
    },

    async performRetry(trigger) {
      deps.logger.info({ trigger }, 'workflow.ingestion.retry_begin');
      const issue = await deps.repo.getIngestionIssue(trigger.issueId);
      if (!issue) {
        deps.logger.error({ trigger }, 'workflow.ingestion.issue_missing');
        throw new Error(`Ingestion issue ${trigger.issueId} not found`);
      }
      if (issue.tenantId !== trigger.tenantId) {
        deps.logger.error({ trigger }, 'workflow.ingestion.issue_tenant_mismatch');
        throw new Error('Ingestion issue does not belong to tenant');
      }
      const resolution = await resolveIngestionIssue(deps, issue);
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'INGESTION', {
        event: 'IngestionRetryWorkflow.RETRY',
        trigger,
        issue: {
          id: issue.id,
          code: issue.code,
          partNumber: issue.partNumber,
          bomId: issue.bomId
        },
        resolution
      });
      deps.logger.info({ trigger, resolution }, 'workflow.ingestion.retry_success');
    },

    async resolveIssue(trigger) {
      await deps.repo.resolveIssue(trigger.issueId);
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'INGESTION', {
        event: 'IngestionRetryWorkflow.RESOLVED',
        trigger
      });
      deps.logger.info({ trigger }, 'workflow.ingestion.resolved');
    }
  };
}

async function resolveIngestionIssue(
  deps: IngestionActivityDeps,
  issue: IngestionIssue
): Promise<{ status: 'RESOLVED'; reason: string; code: IngestionIssue['code']; checkedAt: string }> {
  const checkedAt = new Date().toISOString();
  switch (issue.code) {
    case 'SUPPLIER_MISSING': {
      const partNumber = requirePartNumber(issue);
      const hasMapping = await deps.repo.hasSupplierMapping(issue.tenantId, partNumber);
      if (!hasMapping) {
        deps.logger.warn({ issue }, 'workflow.ingestion.retry_supplier_still_missing');
        throw new Error(`Supplier mapping still missing for part ${partNumber}`);
      }
      return {
        status: 'RESOLVED',
        code: issue.code,
        checkedAt,
        reason: `Detected supplier mapping for part ${partNumber}`
      };
    }
    case 'VALUE_MISSING':
    case 'UNIT_MISSING': {
      const partNumber = requirePartNumber(issue);
      const hasData = await deps.repo.hasCleanCertificateData(issue.tenantId, partNumber);
      if (!hasData) {
        deps.logger.warn({ issue }, 'workflow.ingestion.retry_certificate_incomplete');
        throw new Error(`Certificate data still incomplete for part ${partNumber}`);
      }
      return {
        status: 'RESOLVED',
        code: issue.code,
        checkedAt,
        reason: `Certificate data quality restored for part ${partNumber}`
      };
    }
    case 'UPLOAD_ERROR': {
      const bomId = requireBomId(issue);
      const partNumber = requirePartNumber(issue);
      const snapshot = await deps.repo.getComponentIngestionSnapshot(issue.tenantId, bomId, partNumber);
      if (!snapshot.exists) {
        deps.logger.warn({ issue }, 'workflow.ingestion.retry_component_missing');
        throw new Error(`Component ${partNumber} is still missing from BOM ${bomId}`);
      }
      return {
        status: 'RESOLVED',
        code: issue.code,
        checkedAt,
        reason: `Component ${partNumber} now present for BOM ${bomId}`
      };
    }
    default:
      deps.logger.error({ issue }, 'workflow.ingestion.retry_unsupported_code');
      throw new Error(`Unsupported ingestion issue code ${issue.code}`);
  }
}

function requirePartNumber(issue: IngestionIssue): string {
  if (!issue.partNumber) {
    throw new Error('Ingestion issue missing part number context');
  }
  return issue.partNumber;
}

function requireBomId(issue: IngestionIssue): UUID {
  if (!issue.bomId) {
    throw new Error('Ingestion issue missing BOM context');
  }
  return issue.bomId;
}
