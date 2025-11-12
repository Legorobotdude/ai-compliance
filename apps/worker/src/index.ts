import type { DatabaseClient } from '@certivo/lib-db';
import type { WorkflowClient } from '@certivo/jobs-workflows';
import { WorkflowController, WorkflowRepository, WorkflowService } from '@certivo/jobs-workflows';

export interface WorkerOptions {
  db: DatabaseClient;
  workflowRuntime: WorkflowClient;
}

export function createWorkflowController(options: WorkerOptions): WorkflowController {
  const repo = new WorkflowRepository(options.db);
  const service = new WorkflowService(repo, options.workflowRuntime);
  return new WorkflowController(service);
}

export type { SupplierWorkflowTrigger, IngestionRetryTrigger } from '@certivo/jobs-workflows';
