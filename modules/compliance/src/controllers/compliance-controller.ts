import type { BomUploadRequest, MergedViewRequest } from '../dtos/bom-dtos';
import type { CertificateUploadRequest } from '../dtos/certificate-dtos';
import { ComplianceService } from '../services/compliance-service';
import {
  parseBomUploadRequest,
  parseCertificateUploadRequest,
  parseMergedViewRequest
} from '../validation/compliance-schemas.js';

export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  async uploadBom(payload: BomUploadRequest) {
    const dto = parseBomUploadRequest(payload);
    return this.service.ingestBom(dto);
  }

  async mergedStatus(payload: MergedViewRequest) {
    const dto = parseMergedViewRequest(payload);
    return this.service.mergedView(dto);
  }

  async uploadCertificates(payload: CertificateUploadRequest) {
    const dto = parseCertificateUploadRequest(payload);
    return this.service.ingestCertificates(dto);
  }
}
