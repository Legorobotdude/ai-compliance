import type { AiParseDocumentResponse, CoraService } from '@certivo/cora';
import type { TenantID, UUID } from '@certivo/lib-db';
import type { DocumentService } from '@certivo/file-document';
import type { Logger } from '@certivo/lib-logging';
import { createLogger } from '@certivo/lib-logging';
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

interface ComplianceServiceOptions {
  logger?: Logger;
}

export class ComplianceService {
  private readonly logger: Logger;

  constructor(
    private readonly repo: ComplianceRepository,
    private readonly cora?: CoraService,
    private readonly documents?: DocumentService,
    options: ComplianceServiceOptions = {}
  ) {
    this.logger = options.logger ?? createLogger({ name: 'compliance-service' });
  }

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
    const issueSummary = this.summarizeIssues(issues);
    if (issues.length > 0) {
      this.logger.warn(
        {
          tenantId: request.tenantId,
          bomId,
          issueSummary
        },
        'compliance.bom.ingestion_issues'
      );
    }
    this.logger.info(
      {
        tenantId: request.tenantId,
        bomId,
        productId: request.productId,
        assemblies: persistable.assemblies.length,
        components: persistable.components.length,
        issues: issues.length
      },
      'compliance.bom.ingested'
    );
    await this.repo.recordAuditLog({
      tenantId: request.tenantId,
      actorUserId: request.uploadedBy,
      action: 'COMPLIANCE_BOM_UPLOADED',
      target: `bom:${bomId}`,
      payload: {
        productId: request.productId,
        assemblies: persistable.assemblies.length,
        components: persistable.components.length,
        issues: issueSummary,
        sourceDocumentId: request.sourceDocumentId ?? null
      }
    });

    return {
      bomId,
      assemblies: persistable.assemblies.length,
      components: persistable.components.length,
      issues
    };
  }

  async mergedView(request: MergedViewRequest): Promise<MergedViewResponse> {
    const result = await this.repo.fetchMergedView(request.tenantId, request.bomId, {
      limit: request.limit,
      offset: request.offset,
      status: request.status,
      query: request.query
    });
    return {
      bomId: request.bomId,
      items: result.items,
      pagination: result.pagination,
      summary: result.summary
    };
  }

  async getBomAggregate(tenantId: TenantID, bomId: UUID) {
    return this.repo.fetchBomAggregate(tenantId, bomId);
  }

  async recordIssue(payload: { tenantId: TenantID; bomId: UUID; partNumber?: string; code: string; message: string }) {
    await this.repo.recordIngestionIssue(payload);
    this.logger.warn(
      {
        tenantId: payload.tenantId,
        bomId: payload.bomId,
        partNumber: payload.partNumber,
        code: payload.code
      },
      'compliance.ingestion.issue_recorded'
    );
  }

  async ingestCertificates(request: CertificateUploadRequest): Promise<CertificateUploadResponse> {
    const items: CertificateUploadResponse['items'] = [];
    const issues: CertificateUploadIssue[] = [];

    for (const certificateInput of request.certificates) {
      const certificateRecord = this.toPersistableCertificate(request.tenantId, certificateInput);
      const resolvedFindings = await this.resolveCertificateFindings(request.tenantId, certificateInput, issues);
      const normalizedFindings = resolvedFindings.map((finding) =>
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
      await this.repo.recordAuditLog({
        tenantId: request.tenantId,
        action: 'COMPLIANCE_CERT_UPLOADED',
        target: `certificate:${certificate.id}`,
        payload: {
          supplierId: certificateRecord.supplierId,
          partNumber: certificateRecord.partNumber,
          validUntil: certificate.validUntil,
          findings: normalizedFindings.length,
          dataQualityFlags,
          sourceDocumentId: certificateRecord.sourceDocId ?? null
        }
      });
    }

    const issueSummary = this.summarizeIssues(issues);
    if (issues.length > 0) {
      this.logger.warn(
        {
          tenantId: request.tenantId,
          issueSummary
        },
        'compliance.certs.ingestion_issues'
      );
    }
    this.logger.info(
      {
        tenantId: request.tenantId,
        certificates: items.length,
        issues: issues.length
      },
      'compliance.certs.ingested'
    );

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

  private async resolveCertificateFindings(
    tenantId: TenantID,
    certificate: CertificateInput,
    issues: CertificateUploadIssue[]
  ): Promise<CertificateFindingInput[]> {
    const provided = certificate.findings ?? [];
    if (provided.length > 0) {
      return provided;
    }
    if (!this.cora || !certificate.sourceDocumentId) {
      return [];
    }
    try {
      const downloadUrl =
        this.documents && certificate.sourceDocumentId
          ? await this.documents.createDownloadUrl({
              tenantId,
              documentId: certificate.sourceDocumentId,
              expiresInMs: 5 * 60_000
            })
          : undefined;
      const response = await this.cora.parseDocument({
        tenantId,
        documentId: certificate.sourceDocumentId,
        schema: 'certificate_v1',
        downloadUrl
      });
      this.recordCoraAmbiguities(response, certificate, issues);
      return this.mapCoraFindings(response, certificate, issues);
    } catch (error) {
      issues.push({
        code: 'PARSE_FAILED',
        message: `CORA parsing failed for part ${certificate.partNumber}: ${(error as Error).message}`,
        partNumber: certificate.partNumber
      });
      this.logger.error(
        {
          tenantId,
          documentId: certificate.sourceDocumentId,
          partNumber: certificate.partNumber,
          err: error
        },
        'compliance.certs.cora_parse_failed'
      );
      return [];
    }
  }

  private recordCoraAmbiguities(
    response: AiParseDocumentResponse,
    certificate: CertificateInput,
    issues: CertificateUploadIssue[]
  ) {
    if (!response.ambiguities?.length) {
      return;
    }
    for (const note of response.ambiguities) {
      issues.push({
        code: 'CORA_AMBIGUITY',
        message: note,
        partNumber: certificate.partNumber
      });
    }
  }

  private mapCoraFindings(
    response: AiParseDocumentResponse,
    certificate: CertificateInput,
    issues: CertificateUploadIssue[]
  ): CertificateFindingInput[] {
    if (!response.parts || response.parts.length === 0) {
      issues.push({
        code: 'PARSE_FAILED',
        message: `CORA returned no parts for document ${certificate.sourceDocumentId ?? ''}`,
        partNumber: certificate.partNumber
      });
      return [];
    }

    const normalizedTarget = certificate.partNumber.trim().toUpperCase();
    let selected = response.parts.find((part) => part.partNumber.trim().toUpperCase() === normalizedTarget);

    if (!selected) {
      selected = response.parts[0]!;
      issues.push({
        code: 'PARSE_FAILED',
        message: `CORA response lacked part ${certificate.partNumber}; using part ${selected.partNumber}`,
        partNumber: certificate.partNumber
      });
    }

    return selected.findings.map((finding) => ({
      substanceName: finding.substanceName,
      concentrationValue: finding.concentrationValue ?? undefined,
      concentrationUnit: finding.concentrationUnit ?? undefined,
      concentrationRaw: finding.notes ?? undefined
    }));
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
        this.recordIssue({
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

  private summarizeIssues(issues: Array<{ code: string }>): Record<string, number> {
    return issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.code] = (acc[issue.code] ?? 0) + 1;
      return acc;
    }, {});
  }
}
