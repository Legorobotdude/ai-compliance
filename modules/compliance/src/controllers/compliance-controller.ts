import type { BomUploadRequest, MergedViewRequest } from '../dtos/bom-dtos';
import type { CertificateUploadRequest } from '../dtos/certificate-dtos';
import { ComplianceService } from '../services/compliance-service';

export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  async uploadBom(payload: BomUploadRequest) {
    return this.service.ingestBom(payload);
  }

  async mergedStatus(payload: MergedViewRequest) {
    return this.service.mergedView(payload);
  }

  async uploadCertificates(payload: CertificateUploadRequest) {
    return this.service.ingestCertificates(payload);
  }
}
