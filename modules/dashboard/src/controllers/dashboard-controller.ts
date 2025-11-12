import type { TenantID, UUID } from '@certivo/lib-db';
import { DashboardService } from '../services/dashboard-service';

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  async snapshot(payload: { tenantId: TenantID; bomId?: UUID }) {
    return this.service.getSnapshot(payload);
  }
}
