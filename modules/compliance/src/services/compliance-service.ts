import type { TenantID, UUID } from '@certivo/lib-db';
import type {
  BomAssemblyInput,
  BomUploadRequest,
  BomUploadResponse,
  MergedViewRequest,
  MergedViewResponse,
  PersistableBom
} from '../dtos/bom-dtos';
import type {
  CertificateFindingInput,
  CertificateInput,
  CertificateUploadIssue,
  CertificateUploadRequest,
  CertificateUploadResponse,
  PersistableCertificate,
  PersistableCertificateFinding
} from '../dtos/certificate-dtos';
import { ComplianceRepository } from '../repositories/compliance-repository';
import { BomIngestionError } from '../errors.js';
import { extractAssembliesFromRequest } from './bom-ingestion-parser.js';

export class ComplianceService {
  constructor(private readonly repo: ComplianceRepository) {}

  async ingestBom(request: BomUploadRequest): Promise<BomUploadResponse> {
    const issues: BomUploadResponse['issues'] = [];
    const parsed = await extractAssembliesFromRequest(request.assemblies, request.document);
    issues.push(...parsed.issues);

    if (parsed.assemblies.length === 0) {
      throw new BomIngestionError('BOM upload did not contain any assemblies after parsing');
    }

    const persistable = this.buildPersistableBom(request, parsed.assemblies, issues);
    const partNumbers = Array.from(new Set(persistable.components.map((component) => component.partNumber)));
    const supplierMap = await this.repo.findComponentSuppliers(request.tenantId, partNumbers);
    const supplierIssues = this.identifySupplierGaps(partNumbers, supplierMap);
    issues.push(...supplierIssues);

    const bomId = await this.repo.createBom(persistable);
    await this.persistSupplierIssues(request.tenantId, bomId, supplierIssues);

    return {
      bomId,
      assemblies: persistable.assemblies.length,
      components: persistable.components.length,
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

  async ingestCertificates(request: CertificateUploadRequest): Promise<CertificateUploadResponse> {
    const items: CertificateUploadResponse['items'] = [];
    const issues: CertificateUploadIssue[] = [];

    for (const certificateInput of request.certificates) {
      const certificateRecord = this.toPersistableCertificate(request.tenantId, certificateInput);
      const normalizedFindings = certificateInput.findings.map((finding) =>
        this.normalizeFinding(certificateInput, finding, issues)
      );
      const dataQualityFlags = normalizedFindings.filter(
        (finding) => finding.dataQuality && finding.dataQuality !== 'OK'
      ).length;

      const certificate = await this.repo.withTransaction(async (tx) => {
        const created = await tx.insertCertificate(certificateRecord);
        if (normalizedFindings.length > 0) {
          const withCertificate: PersistableCertificateFinding[] = normalizedFindings.map((finding) => ({
            ...finding,
            certificateId: created.id
          }));
          await tx.insertCertificateFindings(withCertificate);
        }
        return created;
      });

      items.push({
        certificateId: certificate.id,
        findings: normalizedFindings.length,
        validUntil: certificate.validUntil,
        dataQualityFlags
      });
    }

    return { items, issues };
  }

  private buildPersistableBom(
    request: BomUploadRequest,
    assemblies: BomAssemblyInput[],
    issues: BomUploadResponse['issues']
  ): PersistableBom {
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

    for (const assembly of assemblies) {
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

    return persistable;
  }

  private identifySupplierGaps(partNumbers: string[], supplierMap: Map<string, UUID[]>): BomUploadResponse['issues'] {
    const issues: BomUploadResponse['issues'] = [];
    for (const partNumber of partNumbers) {
      if (!supplierMap.has(partNumber)) {
        issues.push({
          code: 'SUPPLIER_MISSING',
          message: `No supplier mapping exists for part ${partNumber}`,
          partNumber
        });
      }
    }
    return issues;
  }

  private async persistSupplierIssues(
    tenantId: TenantID,
    bomId: UUID,
    issues: BomUploadResponse['issues']
  ): Promise<void> {
    const supplierIssues = issues.filter((issue) => issue.code === 'SUPPLIER_MISSING' && issue.partNumber);
    await Promise.all(
      supplierIssues.map((issue) =>
        this.repo.recordIngestionIssue({
          tenantId,
          bomId,
          partNumber: issue.partNumber,
          code: 'SUPPLIER_MISSING',
          message: issue.message
        })
      )
    );
  }

  private toPersistableCertificate(tenantId: TenantID, certificate: CertificateInput): PersistableCertificate {
    const threshold = certificate.thresholdPpm ?? null;
    const documentLimitSource =
      certificate.documentLimitSource ?? (threshold != null ? 'DOC' : 'REGULATION');
    return {
      tenantId,
      supplierId: certificate.supplierId,
      partNumber: certificate.partNumber,
      type: certificate.type,
      declarationDate: certificate.declarationDate ?? null,
      validUntil: certificate.validUntil ?? null,
      thresholdPpm: threshold,
      documentLimitSource,
      sourceDocId: certificate.sourceDocumentId ?? null
    };
  }

  private normalizeFinding(
    certificate: CertificateInput,
    finding: CertificateFindingInput,
    issues: CertificateUploadIssue[]
  ): Omit<PersistableCertificateFinding, 'certificateId'> {
    let dataQuality: PersistableCertificateFinding['dataQuality'] = 'OK';
    let concentrationPpm: number | null = null;

    if (finding.concentrationValue == null) {
      dataQuality = 'VALUE_MISSING';
      issues.push({
        code: 'VALUE_MISSING',
        message: `Missing concentration value for ${finding.substanceName}`,
        partNumber: certificate.partNumber,
        substanceName: finding.substanceName
      });
    } else if (!finding.concentrationUnit) {
      dataQuality = 'UNIT_MISSING';
      issues.push({
        code: 'UNIT_MISSING',
        message: `Missing concentration unit for ${finding.substanceName}`,
        partNumber: certificate.partNumber,
        substanceName: finding.substanceName
      });
    } else {
      concentrationPpm = this.toPpm(finding.concentrationValue, finding.concentrationUnit);
    }

    return {
      substanceName: finding.substanceName,
      concentrationValue: finding.concentrationValue ?? null,
      concentrationUnit: finding.concentrationUnit ?? null,
      concentrationPpm,
      concentrationRaw: finding.concentrationRaw ?? null,
      dataQuality
    };
  }

  private toPpm(value: number, unit: '%' | 'ppm' | 'mg/kg'): number {
    if (unit === '%') {
      return value * 10000;
    }
    return value;
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
