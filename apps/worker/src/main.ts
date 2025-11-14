import { createWorkflowWorkerRuntime, type WorkflowTaskQueues } from '@certivo/jobs-workflows';
import { createPgDatabaseClient } from '@certivo/lib-db';
import { createLogger } from '@certivo/lib-logging';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/certivo';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS;
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE;
const TEMPORAL_SUPPLIER_TASK_QUEUE = process.env.TEMPORAL_SUPPLIER_TASK_QUEUE;
const TEMPORAL_INGESTION_TASK_QUEUE = process.env.TEMPORAL_INGESTION_TASK_QUEUE;

async function startWorker(): Promise<void> {
  const logger = createLogger({ name: 'certivo-worker' });
  const { db, pool } = createPgDatabaseClient({ connectionString: DATABASE_URL });
  const taskQueues: Partial<WorkflowTaskQueues> = {};
  if (TEMPORAL_SUPPLIER_TASK_QUEUE) {
    taskQueues.supplier = TEMPORAL_SUPPLIER_TASK_QUEUE;
  }
  if (TEMPORAL_INGESTION_TASK_QUEUE) {
    taskQueues.ingestion = TEMPORAL_INGESTION_TASK_QUEUE;
  }

  const runtime = await createWorkflowWorkerRuntime({
    db,
    logger,
    temporal: {
      address: TEMPORAL_ADDRESS,
      namespace: TEMPORAL_NAMESPACE,
      taskQueues
    }
  });

  logger.info('Temporal worker runtime started');
  const runPromise = runtime.run();

  const shutdown = async () => {
    logger.info('Temporal worker shutting down');
    await runtime.shutdown();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await runPromise;
}

startWorker().catch((error) => {
  const logger = createLogger({ name: 'certivo-worker' });
  logger.error({ err: error }, 'worker.start_failed');
  process.exit(1);
});
