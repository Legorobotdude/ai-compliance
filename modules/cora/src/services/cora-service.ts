import type {
  AiDocumentFinding,
  AiDocumentPart,
  AiParseDocumentRequest,
  AiParseDocumentResponse,
  AiRiskSummaryRequest,
  AiRiskSummaryResponse,
  AiSupplierEmailRequest,
  AiSupplierEmailResponse
} from '../dtos/ai-dtos.js';
import { CoraClient } from '../http/cora-client.js';

type SnakeDocumentFinding = {
  substance_name: string;
  concentration_value: number;
  concentration_unit: '%' | 'ppm' | 'mg/kg' | null;
  concentration_ppm: number | null;
  notes: string | null;
};

type SnakeDocumentPart = {
  part_number: string;
  findings: SnakeDocumentFinding[];
};

interface SnakeParseDocumentResponse {
  doc_ref: string;
  parts: SnakeDocumentPart[];
  ambiguities: string[];
  validation_report: string[];
}

interface SnakeSupplierEmailResponse {
  supplier_id: string;
  bom_id: string;
  subject: string;
  body: string;
  due_date: string;
  language: string;
}

interface SnakeRiskSummaryResponse {
  summary: string;
  exec_summary: string;
  top_gaps: Array<{
    supplier_name: string;
    reason: 'MISSING' | 'EXPIRED' | 'OVER_LIMIT';
    part_numbers: string[];
    eta_days: number;
  }>;
  stats: Record<string, number>;
}

export class CoraService {
  constructor(private readonly client: CoraClient) {}

  async parseDocument(payload: AiParseDocumentRequest): Promise<AiParseDocumentResponse> {
    const response = await this.client.post<SnakeParseDocumentResponse>(
      '/ai/parse-document',
      {
        document_id: payload.documentId,
        schema: payload.schema ?? 'certificate_v1'
      },
      payload.tenantId
    );

    return {
      docRef: response.doc_ref,
      parts: response.parts.map(toPartFinding),
      ambiguities: response.ambiguities,
      validationReport: response.validation_report
    };
  }

  async supplierEmail(payload: AiSupplierEmailRequest): Promise<AiSupplierEmailResponse> {
    const response = await this.client.post<SnakeSupplierEmailResponse>(
      '/ai/supplier-email',
      {
        supplier_id: payload.supplierId,
        bom_id: payload.bomId,
        language: payload.language,
        tone: payload.tone
      },
      payload.tenantId
    );

    return {
      supplierId: response.supplier_id as unknown as typeof payload.supplierId,
      bomId: response.bom_id as unknown as typeof payload.bomId,
      subject: response.subject,
      body: response.body,
      dueDate: response.due_date,
      language: response.language
    };
  }

  async riskSummary(payload: AiRiskSummaryRequest): Promise<AiRiskSummaryResponse> {
    const response = await this.client.post<SnakeRiskSummaryResponse>(
      '/ai/risk-summary',
      {
        bom_id: payload.bomId,
        product_id: payload.productId
      },
      payload.tenantId
    );

    return {
      summary: response.summary,
      execSummary: response.exec_summary,
      topGaps: response.top_gaps.map((gap) => ({
        supplierName: gap.supplier_name,
        reason: gap.reason,
        partNumbers: gap.part_numbers,
        etaDays: gap.eta_days
      })),
      stats: response.stats
    };
  }
}

function toPartFinding(part: SnakeDocumentPart): AiDocumentPart {
  return {
    partNumber: part.part_number,
    findings: part.findings.map((finding): AiDocumentFinding => ({
      substanceName: finding.substance_name,
      concentrationValue: finding.concentration_value,
      concentrationUnit: finding.concentration_unit,
      concentrationPpm: finding.concentration_ppm,
      notes: finding.notes
    }))
  };
}
