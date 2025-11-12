import type { TenantID, UUID } from '@certivo/lib-db';
import type {
  BomUploadRequest,
  BomUploadResponse,
  MergedViewRequest,
  MergedViewResponse,
  PersistableBom
} from '../dtos/bom-dtos';
import { ComplianceRepository } from '../repositories/compliance-repository';

export class ComplianceService {
  constructor(private readonly repo: ComplianceRepository) {}

  async ingestBom(request: BomUploadRequest): Promise<BomUploadResponse> {
    const issues: BomUploadResponse['issues'] = [];
    const componentsCount = request.assemblies.reduce((acc, assembly) => acc + assembly.components.length, 0);

    const persistable: PersistableBom = {
      bom: {
        tenantId: request.tenantId,
        productId: request.productId,
        uploadedBy: request.uploadedBy,
        sourceDocId: request.sourceDocumentId ?? null
      },
      assemblies: [],
      components: []
    };

    for (const assembly of request.assemblies) {
      persistable.assemblies.push({
        tenantId: request.tenantId,
        bomId: null,
        assemblyId: assembly.assemblyId,
        name: assembly.name,
        parentAssemblyId: assembly.parentAssemblyId ?? null
      });
      for (const component of assembly.components) {
        const normalizedWeightMg = this.normalizeWeight(component.weightMg, component.weightG);
        if (normalizedWeightMg == null) {
          issues.push({
            code: 'WEIGHT_MISSING',
            message: 'Component is missing weight data',
            partNumber: component.partNumber
          });
        }
        persistable.components.push({
          tenantId: request.tenantId,
          bomId: null,
          assemblyId: assembly.assemblyId,
          partNumber: component.partNumber,
          material: component.material ?? null,
          weightG: component.weightG ?? null,
          weightMg: component.weightMg ?? null,
          normalizedWeightMg
        });
      }
    }

    const bomId = await this.repo.createBom(persistable);

    return {
      bomId,
      assemblies: request.assemblies.length,
      components: componentsCount,
      issues
    };
  }

  async mergedView(request: MergedViewRequest): Promise<MergedViewResponse> {
    const items = await this.repo.fetchMergedView(request.tenantId, request.bomId);
    return { bomId: request.bomId, items };
  }

  async getBomAggregate(tenantId: TenantID, bomId: UUID) {
    return this.repo.fetchBomAggregate(tenantId, bomId);
  }

  async recordIssue(payload: { tenantId: TenantID; bomId: UUID; partNumber?: string; code: string; message: string }) {
    await this.repo.recordIngestionIssue(payload);
  }

  private normalizeWeight(weightMg?: number | null, weightG?: number | null): number | null {
    if (typeof weightMg === 'number') {
      return weightMg;
    }
    if (typeof weightG === 'number') {
      return Math.round(weightG * 1000);
    }
    return null;
  }
}
