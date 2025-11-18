import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Supplier, SupplierContact, TenantID, UUID } from '@certivo/lib-db';
import type { Logger } from '@certivo/lib-logging';
import { createLogger } from '@certivo/lib-logging';
import type { CoraService } from '@certivo/cora';
import type {
  ScorecardRequest,
  ScorecardResponse,
  SupplierAssignmentInput,
  SupplierAssignmentResult,
  SupplierBlockedPart,
  SupplierCreateInput,
  SupplierEmailDraft,
  SupplierListRequest,
  SupplierProfile,
  SupplierRequestInput,
  SupplierRequestResult,
  SupplierRequestSummary,
  SupplierScorecardStats,
  SupplierUnassignedPart,
  SupplierUnassignedPartsRequest
} from '../dtos/supplier-dtos.js';
import type { BomSummary, SupplierRepository, SupplierRequestMetrics, SupplierRequestRecord } from '../repositories/supplier-repository.js';

const DEFAULT_UPLOAD_URL = 'https://upload.certivo.local/portal';
const DEFAULT_RECENT_REQUESTS_LIMIT = 5;
const REMINDER_BUFFER_DAYS = 2;

export interface SupplierWorkflowTrigger {
  tenantId: TenantID;
  supplierId: UUID;
  requestId: UUID;
  bomId: UUID;
  dueAt: string;
}

export interface SupplierWorkflowScheduler {
  scheduleSupplierRequest(trigger: SupplierWorkflowTrigger): Promise<void>;
}

class NoopSupplierWorkflowScheduler implements SupplierWorkflowScheduler {
  constructor(private readonly logger: Logger) {}

  async scheduleSupplierRequest(trigger: SupplierWorkflowTrigger): Promise<void> {
    this.logger.warn(
      { trigger },
      'supplier.workflow.scheduler_missing'
    );
  }
}

export interface SupplierWorkflowQueueService {
  queueSupplierWorkflow(trigger: SupplierWorkflowTrigger): Promise<void>;
}

class WorkflowServiceSupplierScheduler implements SupplierWorkflowScheduler {
  constructor(private readonly workflowService: SupplierWorkflowQueueService) {}

  async scheduleSupplierRequest(trigger: SupplierWorkflowTrigger): Promise<void> {
    await this.workflowService.queueSupplierWorkflow(trigger);
  }
}

export interface SupplierServiceOptions {
  coraService?: CoraService;
  workflowScheduler?: SupplierWorkflowScheduler;
  workflowService?: SupplierWorkflowQueueService;
  logger?: Logger;
  uploadPortalUrl?: string;
  recentRequestsLimit?: number;
}

export class SupplierService {
  private readonly cora?: CoraService;
  private readonly logger: Logger;
  private readonly workflowScheduler: SupplierWorkflowScheduler;
  private readonly uploadPortalUrl: string;
  private readonly recentRequestsLimit: number;

  constructor(
    private readonly repository: SupplierRepository,
    options: SupplierServiceOptions = {}
  ) {
    this.cora = options.coraService;
    this.logger = options.logger ?? createLogger({ name: 'supplier-service' });
    if (options.workflowScheduler) {
      this.workflowScheduler = options.workflowScheduler;
    } else if (options.workflowService) {
      this.workflowScheduler = new WorkflowServiceSupplierScheduler(options.workflowService);
    } else {
      this.workflowScheduler = new NoopSupplierWorkflowScheduler(this.logger);
    }
    this.uploadPortalUrl = options.uploadPortalUrl ?? DEFAULT_UPLOAD_URL;
    this.recentRequestsLimit = options.recentRequestsLimit ?? DEFAULT_RECENT_REQUESTS_LIMIT;
  }

  async getScorecard(request: ScorecardRequest): Promise<ScorecardResponse> {
    const supplier = await this.requireSupplier(request.tenantId, request.supplierId);
    const [contacts, metrics, blockedParts, recentRequests] = await Promise.all([
      this.repository.listContacts(request.tenantId, request.supplierId),
      this.repository.getRequestMetrics(request.tenantId, request.supplierId),
      this.repository.listBlockedParts(request.tenantId, request.supplierId),
      this.repository.listRecentRequests(request.tenantId, request.supplierId, this.recentRequestsLimit)
    ]);
    this.logSlowSupplier(request.tenantId, supplier.id, metrics, supplier);

    const profile: SupplierProfile = { ...supplier, contacts };
    const stats: SupplierScorecardStats = {
      complianceRate: supplier.complianceRate,
      targetResponseDays: supplier.responseAvgDays,
      actualResponseDays: metrics.avgResponseDays ?? null,
      openRequests: metrics.openRequests,
      dueSoon: metrics.dueSoon,
      slaBreaches: metrics.slaBreaches,
      lastRequestAt: metrics.lastRequestAt ?? null
    };

    return {
      supplier: profile,
      stats,
      blockedParts,
      recentRequests: recentRequests.map((requestRow) => this.toRequestSummary(requestRow))
    };
  }

  async createRequest(input: SupplierRequestInput): Promise<SupplierRequestResult> {
    const supplier = await this.requireSupplier(input.tenantId, input.supplierId);
    const bom = await this.repository.findBomSummary(input.tenantId, input.bomId);
    if (!bom) {
      throw new Error('BOM not found for supplier request');
    }
    const contactsPromise = this.repository.listContacts(input.tenantId, input.supplierId);
    const blockedParts = await this.repository.listBlockedParts(input.tenantId, input.supplierId, {
      bomId: input.bomId
    });
    const dueAtIso = this.resolveDueDate(input.dueAt, supplier.responseAvgDays);
    const requestRecord = await this.repository.createRequest({
      tenantId: input.tenantId,
      supplierId: input.supplierId,
      bomId: input.bomId,
      dueAt: dueAtIso,
      requestedBy: input.requestedBy
    });
    const contacts = await contactsPromise;
    const emailDraft = await this.draftSupplierEmail(
      {
        tenantId: input.tenantId,
        supplier,
        bom,
        blockedParts,
        dueAt: dueAtIso,
        language: input.languageOverride ?? supplier.language,
        tone: input.tone
      },
      contacts
    );

    await this.repository.recordAuditLog({
      tenantId: input.tenantId,
      actorUserId: input.requestedBy,
      action: 'supplier.request.created',
      target: `supplier:${input.supplierId}`,
      payload: {
        bomId: input.bomId,
        requestId: requestRecord.id,
        dueAt: dueAtIso,
        blockedParts: blockedParts.map((part) => ({
          bomId: part.bomId,
          partNumber: part.partNumber,
          reason: part.reason
        }))
      }
    });

    let workflowScheduled = false;
    try {
      await this.workflowScheduler.scheduleSupplierRequest({
        tenantId: input.tenantId,
        supplierId: input.supplierId,
        requestId: requestRecord.id,
        bomId: input.bomId,
        dueAt: dueAtIso
      });
      workflowScheduled = true;
    } catch (error) {
      this.logger.warn(
        { err: error, supplierId: input.supplierId, requestId: requestRecord.id },
        'supplier.workflow.schedule_failed'
      );
    }

    return {
      requestId: requestRecord.id,
      status: requestRecord.status,
      dueAt: requestRecord.dueAt ?? dueAtIso,
      blockedParts,
      emailDraft,
      workflowScheduled
    };
  }

  async listSuppliers(request: SupplierListRequest): Promise<Supplier[]> {
    return this.repository.listSuppliers(request.tenantId, {
      limit: request.limit,
      search: request.search
    });
  }

  async createSupplier(input: SupplierCreateInput): Promise<Supplier> {
    const complianceRate = clampNumber(input.complianceRate, 0, 1);
    const responseDays = Math.max(1, Math.round(input.responseAvgDays));
    const supplier = await this.repository.createSupplier({
      tenantId: input.tenantId,
      name: input.name.trim(),
      country: input.country.trim(),
      language: input.language.trim().toLowerCase(),
      complianceRate,
      responseAvgDays: responseDays
    });
    await this.repository.recordAuditLog({
      tenantId: input.tenantId,
      actorUserId: input.createdBy ?? null,
      action: 'supplier.created',
      target: `supplier:${supplier.id}`,
      payload: {
        name: supplier.name,
        country: supplier.country,
        language: supplier.language,
        complianceRate,
        responseAvgDays: responseDays
      }
    });
    return supplier;
  }

  async assignSupplierToParts(input: SupplierAssignmentInput): Promise<SupplierAssignmentResult> {
    const supplier = await this.requireSupplier(input.tenantId, input.supplierId);
    const normalizedParts = Array.from(
      new Set(
        input.partNumbers
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
      )
    );
    if (!normalizedParts.length) {
      throw new Error('At least one part number is required');
    }
    const knownParts = await this.repository.listKnownPartNumbers(input.tenantId, normalizedParts);
    const knownSet = new Set(knownParts);
    const assignable = normalizedParts.filter((part) => knownSet.has(part));
    const missingParts = normalizedParts.filter((part) => !knownSet.has(part));
    const upsertResults = assignable.length
      ? await this.repository.upsertComponentSuppliers({
          tenantId: input.tenantId,
          supplierId: supplier.id,
          partNumbers: assignable,
          sourcingType: input.sourcingType
        })
      : [];
    const created = upsertResults.filter((row) => row.inserted).length;
    const updated = upsertResults.length - created;
    if (assignable.length) {
      await this.repository.recordAuditLog({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        action: 'supplier.parts.assigned',
        target: `supplier:${supplier.id}`,
        payload: {
          partNumbers: assignable,
          sourcingType: input.sourcingType ?? null,
          created,
          updated,
          missingParts
        }
      });
    }
    return {
      supplierId: supplier.id,
      partNumbers: assignable,
      created,
      updated,
      missingParts
    };
  }

  async listUnassignedParts(request: SupplierUnassignedPartsRequest): Promise<SupplierUnassignedPart[]> {
    const limit = Math.min(Math.max(request.limit ?? 50, 10), 500);
    return this.repository.listUnassignedParts(request.tenantId, request.bomId, limit);
  }

  private async draftSupplierEmail(
    context: {
      tenantId: TenantID;
      supplier: Supplier;
      bom: BomSummary;
      blockedParts: SupplierBlockedPart[];
      dueAt: string;
      language?: string;
      tone?: 'formal' | 'neutral' | 'friendly';
    },
    contacts: SupplierContact[]
  ): Promise<SupplierEmailDraft> {
    const language = context.language ?? 'en';
    if (!this.cora) {
      return this.buildFallbackEmail(context, contacts, language);
    }
    const startedAt = performance.now();
    try {
      const response = await this.cora.supplierEmail({
        tenantId: context.tenantId,
        supplierId: context.supplier.id,
        bomId: context.bom.bomId,
        language,
        tone: context.tone
      });
      const draft: SupplierEmailDraft = {
        subject: response.subject,
        body: response.body,
        language: response.language ?? language,
        dueDate: response.dueDate ?? context.dueAt,
        uploadUrl: this.uploadPortalUrl
      };
      await this.recordLlmCall(context, draft, startedAt);
      return draft;
    } catch (error) {
      this.logger.warn({ err: error, supplierId: context.supplier.id }, 'supplier.email.cora_failed');
      return this.buildFallbackEmail(context, contacts, language);
    }
  }

  private async recordLlmCall(
    context: {
      tenantId: TenantID;
      supplier: Supplier;
      bom: BomSummary;
      blockedParts: SupplierBlockedPart[];
      dueAt: string;
    },
    draft: SupplierEmailDraft,
    startedAt: number
  ): Promise<void> {
    const promptHash = this.hashEmailContext(context);
    const latencyMs = Math.round(performance.now() - startedAt);
    await this.repository.recordLlmCall({
      tenantId: context.tenantId,
      agent: 'SUPPLIER_EMAIL',
      promptHash,
      inputJson: {
        supplierId: context.supplier.id,
        bomId: context.bom.bomId,
        dueAt: context.dueAt,
        blockedParts: context.blockedParts.map((part) => ({
          partNumber: part.partNumber,
          reason: part.reason
        }))
      },
      outputJson: {
        subject: draft.subject,
        dueDate: draft.dueDate
      },
      model: `cora:supplier-email:${draft.language}`,
      latencyMs
    });
    await this.repository.recordAuditLog({
      tenantId: context.tenantId,
      action: 'supplier.email.llm_recorded',
      target: `supplier:${context.supplier.id}`,
      payload: {
        bomId: context.bom.bomId,
        promptHash,
        latencyMs,
        dueAt: context.dueAt
      }
    });
    this.logger.info(
      {
        tenantId: context.tenantId,
        supplierId: context.supplier.id,
        bomId: context.bom.bomId,
        latencyMs
      },
      'supplier.email.llm_recorded'
    );
  }

  private hashEmailContext(context: {
    supplier: Supplier;
    bom: BomSummary;
    dueAt: string;
    blockedParts: SupplierBlockedPart[];
  }): string {
    const payload = {
      supplierId: context.supplier.id,
      bomId: context.bom.bomId,
      dueAt: context.dueAt,
      blockedParts: context.blockedParts.map((part) => ({
        partNumber: part.partNumber,
        reason: part.reason
      }))
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private buildFallbackEmail(
    context: {
      supplier: Supplier;
      bom: BomSummary;
      blockedParts: SupplierBlockedPart[];
      dueAt: string;
    },
    contacts: SupplierContact[],
    language: string
  ): SupplierEmailDraft {
    const contact = contacts[0];
    const greetingName = contact?.name ?? context.supplier.name;
    const dueDate = new Date(context.dueAt).toISOString().split('T')[0];
    const missingList =
      context.blockedParts.length > 0
        ? context.blockedParts
            .slice(0, 5)
            .map((part) => `- ${part.partNumber} (${part.reason} · ${part.assemblyId})`)
            .join('\n')
        : '- Current BOM components missing coverage';
    const subject = `Requesting updated compliance docs for ${context.bom.bomExternalId}`;
    const body = [
      `Hello ${greetingName},`,
      '',
      `We are reconciling REACH/RoHS coverage for BOM ${context.bom.bomExternalId} (${context.bom.productName}).`,
      'Please upload refreshed declarations for the following components:',
      '',
      missingList,
      '',
      `Upload securely here: ${this.uploadPortalUrl}`,
      `Requested due date: ${dueDate}`,
      '',
      'Thank you,',
      'Certivo Compliance Automation'
    ].join('\n');
    return {
      subject,
      body,
      language,
      dueDate: context.dueAt,
      uploadUrl: this.uploadPortalUrl
    };
  }

  private toRequestSummary(row: SupplierRequestRecord): SupplierRequestSummary {
    return {
      id: row.id,
      bomId: row.bomId,
      bomExternalId: row.bomExternalId,
      status: row.status,
      sentAt: row.sentAt ?? null,
      dueAt: row.dueAt ?? null,
      responseAt: row.responseAt ?? null
    };
  }

  private resolveDueDate(dueAt: string | undefined, responseAvgDays: number): string {
    if (dueAt) {
      return new Date(dueAt).toISOString();
    }
    const turnaroundDays = Math.max(1, Math.round(responseAvgDays ?? 0));
    const totalDays = turnaroundDays + REMINDER_BUFFER_DAYS;
    const dueDate = new Date(Date.now() + totalDays * 24 * 60 * 60 * 1000);
    return dueDate.toISOString();
  }

  private logSlowSupplier(
    tenantId: TenantID,
    supplierId: UUID,
    metrics: SupplierRequestMetrics,
    supplier: Supplier
  ): void {
    if (
      metrics.avgResponseDays != null &&
      supplier.responseAvgDays != null &&
      metrics.avgResponseDays > supplier.responseAvgDays
    ) {
      this.logger.warn(
        {
          tenantId,
          supplierId,
          avgResponseDays: metrics.avgResponseDays,
          targetResponseDays: supplier.responseAvgDays
        },
        'supplier.sla.slow_responder'
      );
    }
    if (metrics.slaBreaches > 0) {
      this.logger.warn(
        {
          tenantId,
          supplierId,
          slaBreaches: metrics.slaBreaches,
          dueSoon: metrics.dueSoon
        },
        'supplier.sla.breaches_detected'
      );
    }
  }

  private async requireSupplier(tenantId: TenantID, supplierId: UUID): Promise<Supplier> {
    const supplier = await this.repository.findSupplier(tenantId, supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
    }
    return supplier;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
