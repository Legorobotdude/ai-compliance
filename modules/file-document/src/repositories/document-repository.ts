import type { DatabaseClient, Document, TenantID, UUID } from '@certivo/lib-db';

const DOCUMENT_COLUMNS = `
  id,
  tenant_id as "tenantId",
  filename,
  mime,
  bytes,
  storage_url as "storageUrl",
  storage_bucket as "storageBucket",
  storage_key as "storageKey",
  storage_class as "storageClass",
  kms_key_id as "kmsKeyId",
  sha256,
  uploaded_at as "uploadedAt",
  upload_status as "uploadStatus",
  upload_completed_at as "uploadCompletedAt",
  scan_status as "scanStatus",
  scan_requested_at as "scanRequestedAt",
  scan_completed_at as "scanCompletedAt",
  retention_expires_at as "retentionExpiresAt",
  deleted_at as "deletedAt",
  parsed_json as "parsedJson",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export class DocumentRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insert(doc: Omit<Document, 'createdAt' | 'updatedAt'>): Promise<Document> {
    const [inserted] = await this.db.query<Document>({
      text: `insert into documents (
                id,
                tenant_id,
                filename,
                mime,
                bytes,
                storage_url,
                storage_bucket,
                storage_key,
                storage_class,
                kms_key_id,
                sha256,
                uploaded_at,
                upload_status,
                upload_completed_at,
                scan_status,
                scan_requested_at,
                scan_completed_at,
                retention_expires_at,
                deleted_at,
                parsed_json
             )
             values (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
             ) returning ${DOCUMENT_COLUMNS}`,
      values: [
        doc.id,
        doc.tenantId,
        doc.filename,
        doc.mime,
        doc.bytes,
        doc.storageUrl,
        doc.storageBucket ?? null,
        doc.storageKey ?? null,
        doc.storageClass ?? null,
        doc.kmsKeyId ?? null,
        doc.sha256,
        doc.uploadedAt,
        doc.uploadStatus,
        doc.uploadCompletedAt ?? null,
        doc.scanStatus,
        doc.scanRequestedAt ?? null,
        doc.scanCompletedAt ?? null,
        doc.retentionExpiresAt ?? null,
        doc.deletedAt ?? null,
        doc.parsedJson ?? null
      ]
    });
    if (!inserted) {
      throw new Error('Document insert failed');
    }
    return inserted;
  }

  async findById(tenantId: TenantID, documentId: UUID): Promise<Document | null> {
    const rows = await this.db.query<Document>({
      text: `select ${DOCUMENT_COLUMNS} from documents where tenant_id = $1 and id = $2`,
      values: [tenantId, documentId]
    });
    return rows[0] ?? null;
  }

  async listByTenant(tenantId: TenantID, limit = 100, offset = 0): Promise<Document[]> {
    return this.db.query<Document>({
      text: `select ${DOCUMENT_COLUMNS}
             from documents
             where tenant_id = $1
               and deleted_at is null
             order by uploaded_at desc
             limit $2 offset $3`,
      values: [tenantId, limit, offset]
    });
  }

  async countByTenant(tenantId: TenantID): Promise<number> {
    const rows = await this.db.query<{ count: string }>({
      text: `select count(*) as count from documents where tenant_id = $1 and deleted_at is null`,
      values: [tenantId]
    });
    return parseInt(rows[0]?.count ?? '0', 10);
  }
}
