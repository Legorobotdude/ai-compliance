import type { IngestionRetryTrigger, SupplierWorkflowTrigger } from '../dtos/workflow-dtos';
import { WorkflowService } from '../services/workflow-service';

export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  async triggerSupplierWorkflow(payload: SupplierWorkflowTrigger) {
    await this.service.queueSupplierWorkflow(payload);
  }

  async triggerIngestionRetry(payload: IngestionRetryTrigger) {
    await this.service.queueIngestionRetry(payload);
  }
}
