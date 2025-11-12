import type { BomUploadRequest, MergedViewRequest } from '../dtos/bom-dtos';
import { ComplianceService } from '../services/compliance-service';

export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  async uploadBom(payload: BomUploadRequest) {
    return this.service.ingestBom(payload);
  }

  async mergedStatus(payload: MergedViewRequest) {
    return this.service.mergedView(payload);
  }
}
