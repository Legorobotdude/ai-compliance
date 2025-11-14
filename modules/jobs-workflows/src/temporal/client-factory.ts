import {
  Connection,
  WorkflowClient as TemporalWorkflowClient,
  WorkflowExecutionAlreadyStartedError
} from '@temporalio/client';
import type { WorkflowClient } from '../services/workflow-service.js';
import type { WorkflowTaskQueues } from './constants.js';
import {
  DEFAULT_TEMPORAL_ADDRESS,
  DEFAULT_TEMPORAL_NAMESPACE,
  DEFAULT_SUPPLIER_TASK_QUEUE,
  DEFAULT_INGESTION_TASK_QUEUE
} from './constants.js';
import type { SupplierWorkflowTrigger, IngestionRetryTrigger } from '../dtos/workflow-dtos.js';
import { supplierRequestWorkflow } from '../workflows/supplier-request.workflow.js';
import { ingestionRetryWorkflow } from '../workflows/ingestion-retry.workflow.js';

export interface TemporalWorkflowClientOptions {
  address?: string;
  namespace?: string;
  taskQueues?: Partial<WorkflowTaskQueues>;
}

export interface TemporalClientRuntime {
  client: WorkflowClient;
  shutdown(): Promise<void>;
}

export async function createTemporalWorkflowClient(
  options: TemporalWorkflowClientOptions = {}
): Promise<TemporalClientRuntime> {
  const connection = await Connection.connect({ address: options.address ?? DEFAULT_TEMPORAL_ADDRESS });
  const namespace = options.namespace ?? DEFAULT_TEMPORAL_NAMESPACE;
  const queues: WorkflowTaskQueues = {
    supplier: options.taskQueues?.supplier ?? DEFAULT_SUPPLIER_TASK_QUEUE,
    ingestion: options.taskQueues?.ingestion ?? DEFAULT_INGESTION_TASK_QUEUE
  };

  const temporalClient = new TemporalWorkflowClient({ connection, namespace });

  const client: WorkflowClient = {
    async scheduleSupplierWorkflow(trigger: SupplierWorkflowTrigger) {
      try {
        await temporalClient.start(supplierRequestWorkflow, {
          taskQueue: queues.supplier,
          workflowId: `supplier-request-${trigger.requestId}`,
          args: [trigger]
        });
      } catch (error) {
        if (error instanceof WorkflowExecutionAlreadyStartedError) {
          return;
        }
        throw error;
      }
    },

    async scheduleIngestionRetry(trigger: IngestionRetryTrigger) {
      try {
        await temporalClient.start(ingestionRetryWorkflow, {
          taskQueue: queues.ingestion,
          workflowId: `ingestion-retry-${trigger.issueId}`,
          args: [trigger]
        });
      } catch (error) {
        if (error instanceof WorkflowExecutionAlreadyStartedError) {
          return;
        }
        throw error;
      }
    }
  };

  return {
    client,
    async shutdown() {
      await connection.close();
    }
  };
}
