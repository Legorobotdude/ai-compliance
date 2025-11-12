import type { ScorecardRequest, SupplierRequestInput } from '../dtos/supplier-dtos';
import { SupplierService } from '../services/supplier-service';

export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  async scorecard(payload: ScorecardRequest) {
    return this.service.getScorecard(payload);
  }

  async createRequest(payload: SupplierRequestInput) {
    return this.service.createRequest(payload);
  }
}
