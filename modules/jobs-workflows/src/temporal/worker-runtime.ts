import { Worker, NativeConnection } from '@temporalio/worker';
import type { DatabaseClient } from '@certivo/lib-db';
import type { Logger } from '@certivo/lib-logging';
import { fileURLToPath } from 'node:url';
import { createSupplierWorkflowActivities, createIngestionRetryActivities } from '../activities/index.js';
import { WorkflowRepository } from '../repositories/workflow-repository.js';
import type { WorkflowTaskQueues } from './constants.js';
import {
  DEFAULT_TEMPORAL_ADDRESS,
  DEFAULT_TEMPORAL_NAMESPACE,
  DEFAULT_SUPPLIER_TASK_QUEUE,
  DEFAULT_INGESTION_TASK_QUEUE
} from './constants.js';

export interface WorkflowWorkerOptions {
  db: DatabaseClient;
  logger: Logger;
  temporal?: {
    address?: string;
    namespace?: string;
    taskQueues?: Partial<WorkflowTaskQueues>;
  };
}

export interface WorkflowWorkerRuntime {
  run(): Promise<void>;
  shutdown(): Promise<void>;
}

export async function createWorkflowWorkerRuntime(
  options: WorkflowWorkerOptions
): Promise<WorkflowWorkerRuntime> {
  const connection = await NativeConnection.connect({
    address: options.temporal?.address ?? DEFAULT_TEMPORAL_ADDRESS
  });
  const namespace = options.temporal?.namespace ?? DEFAULT_TEMPORAL_NAMESPACE;
  const taskQueues: WorkflowTaskQueues = {
    supplier: options.temporal?.taskQueues?.supplier ?? DEFAULT_SUPPLIER_TASK_QUEUE,
    ingestion: options.temporal?.taskQueues?.ingestion ?? DEFAULT_INGESTION_TASK_QUEUE
  };

  const repo = new WorkflowRepository(options.db);
  const supplierActivities = createSupplierWorkflowActivities({ repo, logger: options.logger });
  const ingestionActivities = createIngestionRetryActivities({ repo, logger: options.logger });

  const workflowsPath = fileURLToPath(new URL('../workflows/index.js', import.meta.url));

  const workers: Worker[] = [];

  workers.push(
    await Worker.create({
      connection,
      namespace,
      taskQueue: taskQueues.supplier,
      workflowsPath,
      activities: supplierActivities
    })
  );

  workers.push(
    await Worker.create({
      connection,
      namespace,
      taskQueue: taskQueues.ingestion,
      workflowsPath,
      activities: ingestionActivities
    })
  );

  let shuttingDown = false;

  return {
    async run() {
      await Promise.all(workers.map((worker) => worker.run()));
    },
    async shutdown() {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      await Promise.all(
        workers.map(async (worker) => {
          try {
            await worker.shutdown();
          } catch (error) {
            options.logger.error({ err: error }, 'workflow.worker.shutdown_failed');
          }
        })
      );
      await connection.close();
    }
  };
}
