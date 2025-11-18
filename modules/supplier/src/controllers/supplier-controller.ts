import type {
  ScorecardRequest,
  SupplierAssignmentInput,
  SupplierCreateInput,
  SupplierListRequest,
  SupplierRequestInput,
  SupplierUnassignedPartsRequest
} from '../dtos/supplier-dtos';
import { SupplierService } from '../services/supplier-service';

export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  async listSuppliers(payload: SupplierListRequest) {
    return this.service.listSuppliers(payload);
  }

  async scorecard(payload: ScorecardRequest) {
    return this.service.getScorecard(payload);
  }

  async createSupplier(payload: SupplierCreateInput) {
    return this.service.createSupplier(payload);
  }

  async createRequest(payload: SupplierRequestInput) {
    return this.service.createRequest(payload);
  }

  async assignSupplier(payload: SupplierAssignmentInput) {
    return this.service.assignSupplierToParts(payload);
  }

  async listUnassignedParts(payload: SupplierUnassignedPartsRequest) {
    return this.service.listUnassignedParts(payload);
  }
}
