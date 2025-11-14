export const DEFAULT_TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
export const DEFAULT_TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default';
export const DEFAULT_SUPPLIER_TASK_QUEUE = process.env.TEMPORAL_SUPPLIER_TASK_QUEUE ?? 'supplier-workflows';
export const DEFAULT_INGESTION_TASK_QUEUE =
  process.env.TEMPORAL_INGESTION_TASK_QUEUE ?? 'ingestion-retries';

export interface WorkflowTaskQueues {
  supplier: string;
  ingestion: string;
}
