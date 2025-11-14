import type { SupplierWorkflowTrigger, IngestionRetryTrigger } from '../dtos/workflow-dtos';
import { WorkflowRepository } from '../repositories/workflow-repository';

export interface WorkflowClient {
  scheduleSupplierWorkflow(trigger: SupplierWorkflowTrigger): Promise<void>;
  scheduleIngestionRetry(trigger: IngestionRetryTrigger): Promise<void>;
}

export class WorkflowService {
  constructor(private readonly repo: WorkflowRepository, private readonly client: WorkflowClient) {}

  async queueSupplierWorkflow(trigger: SupplierWorkflowTrigger) {
    await this.repo.logWorkflowEvent(trigger.tenantId, 'SUPPLIER_REQUEST', {
      event: 'SupplierRequestWorkflow.REQUESTED',
      trigger
    });
    await this.client.scheduleSupplierWorkflow(trigger);
  }

  async queueIngestionRetry(trigger: IngestionRetryTrigger) {
    await this.repo.markIssueInProgress(trigger.issueId);
    await this.client.scheduleIngestionRetry(trigger);
  }

  async resolveIssue(issueId: IngestionRetryTrigger['issueId']) {
    await this.repo.resolveIssue(issueId);
  }
}
