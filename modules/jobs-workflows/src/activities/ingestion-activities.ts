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
      // Future implementation: call compliance ingestion pipelines.
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'INGESTION', {
        event: 'IngestionRetryWorkflow.RETRY',
        trigger
      });
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
