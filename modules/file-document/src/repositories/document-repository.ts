import type { DatabaseClient, Document, TenantID, UUID } from '@certivo/lib-db';

export class DocumentRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insert(doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const [inserted] = await this.db.query<Document>({
      text: `insert into documents (tenant_id, filename, mime, bytes, storage_url, sha256, uploaded_at, parsed_json)
             values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      values: [
        doc.tenantId,
        doc.filename,
        doc.mime,
        doc.bytes,
        doc.storageUrl,
        doc.sha256,
        doc.uploadedAt,
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
      text: `select * from documents where tenant_id = $1 and id = $2`,
      values: [tenantId, documentId]
    });
    return rows[0] ?? null;
  }
}
