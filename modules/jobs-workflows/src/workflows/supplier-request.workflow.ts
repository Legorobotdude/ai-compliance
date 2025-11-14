import { proxyActivities, setHandler, sleep, defineQuery } from '@temporalio/workflow';
import type { SupplierWorkflowTrigger } from '../dtos/workflow-dtos.js';
import type { SupplierWorkflowActivities } from '../activities/supplier-activities.js';

const supplierActivities = proxyActivities<SupplierWorkflowActivities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '5 seconds',
    maximumAttempts: 5,
    backoffCoefficient: 2
  }
});

const REMINDER_BUFFER_MS = 2 * 24 * 60 * 60 * 1000;
const MIN_WAIT_MS = 60 * 1000;

export interface SupplierWorkflowState {
  stage: 'QUEUED' | 'SENT' | 'WAITING' | 'ESCALATED' | 'COMPLETED';
  requestId: string;
  dueAt: string;
  respondedAt?: string | null;
  escalated?: boolean;
}

export const SUPPLIER_WORKFLOW_STATE_QUERY = defineQuery<SupplierWorkflowState>(
  'supplierRequestWorkflowState'
);

export async function supplierRequestWorkflow(trigger: SupplierWorkflowTrigger): Promise<void> {
  let state: SupplierWorkflowState = {
    stage: 'QUEUED',
    requestId: trigger.requestId,
    dueAt: trigger.dueAt
  };

  setHandler(SUPPLIER_WORKFLOW_STATE_QUERY, () => state);

  await supplierActivities.logQueued(trigger);

  await supplierActivities.dispatchInitialRequest(trigger);
  state = { ...state, stage: 'SENT' };

  const waitMs = computeWaitMs(trigger.dueAt);
  await sleep(waitMs);

  state = { ...state, stage: 'WAITING' };
  const response = await supplierActivities.checkForResponse(trigger);
  if (response.respondedAt) {
    state = { ...state, stage: 'COMPLETED', respondedAt: response.respondedAt };
    await supplierActivities.finalizeRequest(trigger, {
      responded: true,
      respondedAt: response.respondedAt
    });
    return;
  }

  await supplierActivities.escalateRequest(trigger);
  state = { ...state, stage: 'ESCALATED', escalated: true };

  await sleep(REMINDER_BUFFER_MS);
  const finalResponse = await supplierActivities.checkForResponse(trigger);
  await supplierActivities.finalizeRequest(trigger, {
    responded: Boolean(finalResponse.respondedAt),
    respondedAt: finalResponse.respondedAt
  });
  state = {
    ...state,
    stage: 'COMPLETED',
    respondedAt: finalResponse.respondedAt ?? null
  };
}

function computeWaitMs(dueAt: string): number {
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) {
    return MIN_WAIT_MS;
  }
  const delta = due - Date.now();
  return delta > 0 ? delta : MIN_WAIT_MS;
}
