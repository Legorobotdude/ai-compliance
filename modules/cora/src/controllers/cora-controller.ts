import type {
  AiChatRequest,
  AiChatResponse,
  AiParseDocumentRequest,
  AiParseDocumentResponse,
  AiRiskSummaryRequest,
  AiRiskSummaryResponse,
  AiSupplierEmailRequest,
  AiSupplierEmailResponse
} from '../dtos/ai-dtos.js';
import { CoraService } from '../services/cora-service.js';

export class CoraController {
  constructor(private readonly service: CoraService) {}

  parseDocument(payload: AiParseDocumentRequest): Promise<AiParseDocumentResponse> {
    return this.service.parseDocument(payload);
  }

  supplierEmail(payload: AiSupplierEmailRequest): Promise<AiSupplierEmailResponse> {
    return this.service.supplierEmail(payload);
  }

  riskSummary(payload: AiRiskSummaryRequest): Promise<AiRiskSummaryResponse> {
    return this.service.riskSummary(payload);
  }

  chat(payload: AiChatRequest): Promise<AiChatResponse> {
    return this.service.chat(payload);
  }
}
