import type { UUID } from '@certivo/lib-db';
import type { ScorecardRequest, ScorecardResponse, SupplierRequestInput } from '../dtos/supplier-dtos';
import { SupplierRepository } from '../repositories/supplier-repository';

export class SupplierService {
  constructor(private readonly repository: SupplierRepository) {}

  async getScorecard(request: ScorecardRequest): Promise<ScorecardResponse> {
    const supplier = await this.repository.findSupplier(request.tenantId, request.supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
    }
    const [requests, blockedParts] = await Promise.all([
      this.repository.listOpenRequests(request.tenantId, request.supplierId),
      this.repository.blockedParts(request.tenantId, request.supplierId)
    ]);
    const avgResponseDays = supplier.responseAvgDays;
    const lastRequest = requests
      .map((req) => req.sentAt)
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1);
    return {
      supplier,
      requestsOpen: requests.length,
      avgResponseDays,
      lastRequest: lastRequest ?? null,
      blockedParts
    };
  }

  async createRequest(input: SupplierRequestInput): Promise<{ requestId: UUID }> {
    const id = await this.repository.createRequest({
      tenantId: input.tenantId,
      supplierId: input.supplierId,
      bomId: input.bomId,
      dueAt: input.dueAt,
      requestedBy: input.requestedBy
    });
    return { requestId: id };
  }
}
