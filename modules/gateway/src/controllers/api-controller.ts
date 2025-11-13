import type {
  BomUploadRequest,
  CertificateUploadRequest,
  MergedViewRequest
} from '@certivo/compliance';
import { ComplianceController } from '@certivo/compliance';
import type { ImpactPredictRequest } from '@certivo/risk-impact';
import { RiskImpactController } from '@certivo/risk-impact';
import type { ScorecardRequest, SupplierRequestInput } from '@certivo/supplier';
import { SupplierController } from '@certivo/supplier';
import type { DownloadUrlRequest, FetchRequest, ListRequest, UploadRequest } from '@certivo/file-document';
import { DocumentController } from '@certivo/file-document';
import type { SearchQuery } from '@certivo/search-rag';
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

  async postCertificateUpload(req: HttpRequest<CertificateUploadRequest>, res: HttpResponse) {
    const result = await this.compliance.uploadCertificates(req.body);
    res.status(201).json(result);
  }

  async getMerged(req: HttpRequest<unknown, { bomId: string }>, res: HttpResponse) {
    const payload: MergedViewRequest = { tenantId: req.tenantId, bomId: req.params.bomId as unknown as UUID };
    const result = await this.compliance.mergedStatus(payload);
    res.status(200).json(result);
  }

  async getSupplierScorecard(req: HttpRequest<unknown, { supplierId: string }>, res: HttpResponse) {
    const payload: ScorecardRequest = { tenantId: req.tenantId, supplierId: req.params.supplierId as unknown as UUID };
    const result = await this.supplier.scorecard(payload);
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
}
