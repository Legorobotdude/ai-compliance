import type {
  BomUploadRequest,
  CertificateUploadRequest,
  CreateProductRequest,
  MergedViewRequest
} from '@certivo/compliance';
import { ComplianceController } from '@certivo/compliance';
import type { ImpactPredictRequest } from '@certivo/risk-impact';
import { RiskImpactController } from '@certivo/risk-impact';
import type {
  ScorecardRequest,
  SupplierAssignmentInput,
  SupplierCreateInput,
  SupplierListRequest,
  SupplierRequestInput,
  SupplierUnassignedPartsRequest
} from '@certivo/supplier';
import { SupplierController } from '@certivo/supplier';
import type { DownloadUrlRequest, FetchRequest, ListRequest, UploadRequest } from '@certivo/file-document';
import { DocumentController } from '@certivo/file-document';
import type { DocumentIngestRequest, SearchFilters, SearchQuery } from '@certivo/search-rag';
import { SearchController } from '@certivo/search-rag';
import type { DashboardSnapshotDto } from '@certivo/dashboard';
import { DashboardController } from '@certivo/dashboard';
import type {
  AiParseDocumentRequest,
  AiSupplierEmailRequest,
  AiRiskSummaryRequest
} from '@certivo/cora';
import { CoraController } from '@certivo/cora';
import type { UUID } from '@certivo/lib-db';
import type { HttpRequest, HttpResponse } from '../types/http';

interface AiChatHttpRequest {
  tenantId: string;
  conversationId?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  topK?: number;
  filters?: SearchFilters;
}

export class ApiController {
  constructor(
    private readonly compliance: ComplianceController,
    private readonly supplier: SupplierController,
    private readonly risk: RiskImpactController,
    private readonly documents: DocumentController,
    private readonly search: SearchController,
    private readonly dashboard: DashboardController,
    private readonly cora: CoraController
  ) {}

  async postBomUpload(req: HttpRequest<BomUploadRequest>, res: HttpResponse) {
    const result = await this.compliance.uploadBom(req.body);
    res.status(201).json(result);
  }

  async getSuppliers(
    req: HttpRequest<unknown, Record<string, string>, { limit?: string; search?: string }>,
    res: HttpResponse
  ) {
    const payload: SupplierListRequest = {
      tenantId: req.tenantId,
      limit: parseLimitParam(req.query.limit),
      search: req.query.search
    };
    const suppliers = await this.supplier.listSuppliers(payload);
    res.status(200).json({ suppliers });
  }

  async postProduct(req: HttpRequest<CreateProductRequest>, res: HttpResponse) {
    const result = await this.compliance.createProduct(req.body);
    res.status(201).json(result);
  }

  async postSupplier(req: HttpRequest<SupplierCreateInput>, res: HttpResponse) {
    const supplier = await this.supplier.createSupplier(req.body);
    res.status(201).json(supplier);
  }

  async postCertificateUpload(req: HttpRequest<CertificateUploadRequest>, res: HttpResponse) {
    const result = await this.compliance.uploadCertificates(req.body);
    res.status(201).json(result);
  }

  async getMerged(
    req: HttpRequest<unknown, { bomId: string }, { limit?: string; offset?: string; status?: string; query?: string }>,
    res: HttpResponse
  ) {
    const payload: MergedViewRequest = {
      tenantId: req.tenantId,
      bomId: req.params.bomId as unknown as UUID,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      status: req.query.status as MergedViewRequest['status'] | undefined,
      query: req.query.query
    };
    const result = await this.compliance.mergedStatus(payload);
    res.status(200).json(result);
  }

  async getSupplierScorecard(req: HttpRequest<unknown, { supplierId: string }>, res: HttpResponse) {
    const payload: ScorecardRequest = { tenantId: req.tenantId, supplierId: req.params.supplierId as unknown as UUID };
    const result = await this.supplier.scorecard(payload);
    res.status(200).json(result);
  }

  async postSupplierAssignment(req: HttpRequest<SupplierAssignmentInput>, res: HttpResponse) {
    const result = await this.supplier.assignSupplier(req.body);
    res.status(200).json(result);
  }

  async postSupplierRequest(req: HttpRequest<SupplierRequestInput>, res: HttpResponse) {
    const result = await this.supplier.createRequest(req.body);
    res.status(202).json(result);
  }

  async postImpactPredict(req: HttpRequest<ImpactPredictRequest>, res: HttpResponse) {
    const result = await this.risk.predict(req.body);
    res.status(200).json(result);
  }

  async postDocumentUpload(req: HttpRequest<UploadRequest>, res: HttpResponse) {
    const result = await this.documents.upload(req.body);
    res.status(201).json(result);
  }

  async getDocument(req: HttpRequest<unknown, { documentId: string }>, res: HttpResponse) {
    const payload: FetchRequest = { tenantId: req.tenantId, documentId: req.params.documentId as unknown as UUID };
    const doc = await this.documents.get(payload);
    res.status(200).json(doc);
  }

  async getDocuments(
    req: HttpRequest<unknown, Record<string, string>, { limit?: string; offset?: string }>,
    res: HttpResponse
  ) {
    const payload: ListRequest = {
      tenantId: req.tenantId,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined
    };
    const result = await this.documents.list(payload);
    res.status(200).json(result);
  }

  async getDocumentDownloadUrl(req: HttpRequest<unknown, { documentId: string }>, res: HttpResponse) {
    const payload: DownloadUrlRequest = {
      tenantId: req.tenantId,
      documentId: req.params.documentId as unknown as UUID
    };
    const url = await this.documents.createDownloadUrl(payload);
    res.status(200).json({ url });
  }

  async getSearch(
    req: HttpRequest<unknown, Record<string, string>, { q: string; topK?: string }>,
    res: HttpResponse
  ) {
    const payload: SearchQuery = {
      tenantId: req.tenantId,
      query: req.query.q,
      topK: req.query.topK ? Number(req.query.topK) : undefined
    };
    const result = await this.search.search(payload);
    res.status(200).json(result);
  }

  async postRagDocument(req: HttpRequest<DocumentIngestRequest>, res: HttpResponse) {
    const result = await this.search.ingestDocument(req.body);
    res.status(201).json(result);
  }

  async getDashboardSnapshot(
    req: HttpRequest<unknown, Record<string, string>, { bomId?: string }>,
    res: HttpResponse
  ) {
    const snapshot: DashboardSnapshotDto = await this.dashboard.snapshot({
      tenantId: req.tenantId,
      bomId: req.query.bomId ? (req.query.bomId as UUID) : undefined
    });
    res.status(200).json(snapshot);
  }

  async getUnassignedParts(
    req: HttpRequest<unknown, Record<string, string>, { bomId: string; limit?: string }>,
    res: HttpResponse
  ) {
    if (!req.query.bomId) {
      throw new Error('bomId is required');
    }
    const payload: SupplierUnassignedPartsRequest = {
      tenantId: req.tenantId,
      bomId: req.query.bomId as unknown as UUID,
      limit: parseLimitParam(req.query.limit)
    };
    const parts = await this.supplier.listUnassignedParts(payload);
    res.status(200).json({ parts });
  }

  async postAiParseDocument(req: HttpRequest<AiParseDocumentRequest>, res: HttpResponse) {
    const payload: AiParseDocumentRequest = { ...req.body };
    if (!payload.downloadUrl) {
      payload.downloadUrl = await this.documents.createDownloadUrl({
        tenantId: req.tenantId,
        documentId: payload.documentId
      });
    }
    const result = await this.cora.parseDocument(payload);
    res.status(200).json(result);
  }

  async postAiSupplierEmail(req: HttpRequest<AiSupplierEmailRequest>, res: HttpResponse) {
    const result = await this.cora.supplierEmail(req.body);
    res.status(200).json(result);
  }

  async postAiRiskSummary(req: HttpRequest<AiRiskSummaryRequest>, res: HttpResponse) {
    const result = await this.cora.riskSummary(req.body);
    res.status(200).json(result);
  }

  async postAiChat(req: HttpRequest<AiChatHttpRequest>, res: HttpResponse) {
    const lastUserMessage = [...req.body.messages].reverse().find((message) => message.role === 'user');
    if (!lastUserMessage) {
      throw new Error('At least one user message is required for chat completion');
    }
    const context = await this.search.buildPromptContext({
      tenantId: req.tenantId,
      query: lastUserMessage.content,
      topK: req.body.topK,
      filters: req.body.filters,
      conversationId: req.body.conversationId as UUID | undefined
    });
    const chatResponse = await this.cora.chat({
      tenantId: req.tenantId,
      conversationId: req.body.conversationId as UUID | undefined,
      messages: req.body.messages,
      contextChunks: context.results.map((chunk) => ({
        chunkId: chunk.id as UUID,
        content: chunk.content,
        sourceTitle: chunk.documentTitle,
        sourceUrl: chunk.sourceUrl,
        score: chunk.score
      }))
    });
    res.status(200).json({
      conversationId: chatResponse.conversationId,
      messageId: chatResponse.messageId,
      reply: chatResponse.reply,
      citations: chatResponse.citations,
      context
    });
  }
}

function parseLimitParam(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return parsed;
}
