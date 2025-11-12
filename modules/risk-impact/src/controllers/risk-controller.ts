import type { ImpactPredictRequest } from '../dtos/impact-dtos';
import { RiskImpactService } from '../services/risk-impact-service';

export class RiskImpactController {
  constructor(private readonly service: RiskImpactService) {}

  async predict(payload: ImpactPredictRequest) {
    return this.service.predictImpact(payload);
  }
}
