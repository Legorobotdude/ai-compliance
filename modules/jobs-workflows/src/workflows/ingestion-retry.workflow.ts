import { proxyActivities } from '@temporalio/workflow';
import type { IngestionRetryTrigger } from '../dtos/workflow-dtos.js';
import type { IngestionRetryActivities } from '../activities/ingestion-activities.js';

const ingestionActivities = proxyActivities<IngestionRetryActivities>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 5
  }
});

export async function ingestionRetryWorkflow(trigger: IngestionRetryTrigger): Promise<void> {
  await ingestionActivities.markIssueQueued(trigger);
  await ingestionActivities.performRetry(trigger);
  await ingestionActivities.resolveIssue(trigger);
}
