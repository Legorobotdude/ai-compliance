import type { Logger } from '@certivo/lib-logging';
import type { SupplierWorkflowTrigger } from '../dtos/workflow-dtos.js';
import { WorkflowRepository } from '../repositories/workflow-repository.js';

export interface SupplierWorkflowActivities {
  logQueued(trigger: SupplierWorkflowTrigger): Promise<void>;
  dispatchInitialRequest(trigger: SupplierWorkflowTrigger): Promise<{ sentAt: string }>;
  checkForResponse(
    trigger: SupplierWorkflowTrigger
  ): Promise<{ respondedAt?: string | null; status?: string | null }>;
  escalateRequest(trigger: SupplierWorkflowTrigger): Promise<{ escalatedAt: string }>;
  finalizeRequest(
    trigger: SupplierWorkflowTrigger,
    result: { responded: boolean; respondedAt?: string | null }
  ): Promise<void>;
}

export interface SupplierActivityDeps {
  repo: WorkflowRepository;
  logger: Logger;
}

export function createSupplierWorkflowActivities(deps: SupplierActivityDeps): SupplierWorkflowActivities {
  return {
    async logQueued(trigger) {
      deps.logger.info({ trigger }, 'workflow.supplier.queued');
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'SUPPLIER_REQUEST', {
        event: 'SupplierRequestWorkflow.QUEUED',
        trigger
      });
    },

    async dispatchInitialRequest(trigger) {
      await deps.repo.markSupplierRequestSent(trigger.tenantId, trigger.requestId);
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'SUPPLIER_REQUEST', {
        event: 'SupplierRequestWorkflow.SENT',
        trigger
      });
      return { sentAt: new Date().toISOString() };
    },

    async checkForResponse(trigger) {
      const request = await deps.repo.getSupplierRequest(trigger.tenantId, trigger.requestId);
      const respondedAt = request?.responseAt ?? null;
      const status = request?.status ?? null;
      if (respondedAt) {
        deps.logger.info(
          { trigger, respondedAt },
          'workflow.supplier.response_detected'
        );
      }
      return { respondedAt, status };
    },

    async escalateRequest(trigger) {
      await deps.repo.markSupplierEscalated(trigger.tenantId, trigger.requestId);
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'SUPPLIER_REQUEST', {
        event: 'SupplierRequestWorkflow.ESCALATED',
        trigger
      });
      const escalatedAt = new Date().toISOString();
      deps.logger.warn({ trigger }, 'workflow.supplier.escalated');
      return { escalatedAt };
    },

    async finalizeRequest(trigger, result) {
      await deps.repo.completeSupplierRequest(trigger.tenantId, trigger.requestId, result);
      await deps.repo.logWorkflowEvent(trigger.tenantId, 'SUPPLIER_REQUEST', {
        event: 'SupplierRequestWorkflow.COMPLETED',
        trigger,
        result
      });
      deps.logger.info({ trigger, result }, 'workflow.supplier.completed');
    }
  };
}
