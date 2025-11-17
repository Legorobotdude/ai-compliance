import type {
  BomComponent,
  BomSubassembly,
  ComplianceStatusRow,
  TenantID,
  UUID
} from '@certivo/lib-db';

export interface BomAssemblyInput {
  assemblyId: string;
  name: string;
  parentAssemblyId?: string | null;
  components: Array<Pick<BomComponent, 'partNumber' | 'material' | 'weightG' | 'weightMg'>>;
}

export type BomUploadEncoding = 'base64' | 'utf8';

export interface BomUploadDocument {
  filename: string;
  mimeType: string;
  encoding?: BomUploadEncoding;
  content: string;
}

export interface BomUploadRequest {
  tenantId: TenantID;
  productId: UUID;
  uploadedBy: UUID;
  sourceDocumentId?: UUID | null;
  assemblies?: BomAssemblyInput[];
  document?: BomUploadDocument;
}

export interface BomUploadResponse {
  bomId: UUID;
  assemblies: number;
  components: number;
  issues: Array<{ code: string; message: string; partNumber?: string }>;
}

export type ComplianceStatus = ComplianceStatusRow['status'];

export interface MergedViewRequest {
  tenantId: TenantID;
  bomId: UUID;
  limit?: number;
  offset?: number;
  status?: ComplianceStatus;
  query?: string;
}

export interface MergedViewResponse {
  bomId: UUID;
  items: ComplianceStatusRow[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    total: number;
    counts: Record<ComplianceStatus, number>;
  };
}

export interface IngestionIssueInput {
  tenantId: TenantID;
  bomId: UUID;
  partNumber?: string;
  code: string;
  message: string;
}

type AssemblyRecord = Omit<BomSubassembly, 'id' | 'createdAt' | 'updatedAt' | 'bomId'> & { bomId?: UUID | null };
type ComponentRecord = Omit<BomComponent, 'id' | 'createdAt' | 'updatedAt' | 'bomId'> & { bomId?: UUID | null };

export interface PersistableBom {
  bom: {
    tenantId: TenantID;
    productId: UUID;
    uploadedBy: UUID;
    sourceDocId?: UUID | null;
  };
  assemblies: AssemblyRecord[];
  components: ComponentRecord[];
}
