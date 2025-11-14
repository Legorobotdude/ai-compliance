import type {
  AuditLogInsert,
  Bom,
  BomComponent,
  BomSubassembly,
  Certificate,
  ComplianceStatusRow,
  DatabaseClient,
  TenantID,
  UUID
} from '@certivo/lib-db';
import type { IngestionIssueInput, PersistableBom } from '../dtos/bom-dtos';
import type { PersistableCertificate, PersistableCertificateFinding } from '../dtos/certificate-dtos';

export interface BomAggregate {
  bom: Bom;
  subassemblies: BomSubassembly[];
  components: BomComponent[];
}

export class ComplianceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async withTransaction<T>(callback: (repo: ComplianceRepository) => Promise<T>): Promise<T> {
    return this.db.withTransaction((tx) => callback(new ComplianceRepository(tx)));
  }

  async createBom(payload: PersistableBom): Promise<UUID> {
    return this.db.withTransaction(async (tx) => {
      const [result] = await tx.query<{ id: UUID }>({
        text: `select create_bom($1::jsonb) as id`,
        values: [payload]
      });
      if (!result) {
        throw new Error('Failed to create BOM');
      }
      return result.id;
    });
  }

  async fetchBomAggregate(tenantId: TenantID, bomId: UUID): Promise<BomAggregate | null> {
    const boms = await this.db.query<Bom>({
      text: `select * from boms where id = $1 and tenant_id = $2`,
      values: [bomId, tenantId]
    });
    if (boms.length === 0) {
      return null;
    }
    const bom = boms[0]!;
    const [subassemblies, components] = await Promise.all([
      this.db.query<BomSubassembly>({
        text: `select * from bom_subassemblies where bom_id = $1 and tenant_id = $2`,
        values: [bomId, tenantId]
      }),
      this.db.query<BomComponent>({
        text: `select * from bom_components where bom_id = $1 and tenant_id = $2`,
        values: [bomId, tenantId]
      })
    ]);
    return { bom, subassemblies, components };
  }

  async fetchMergedView(tenantId: TenantID, bomId: UUID): Promise<ComplianceStatusRow[]> {
    return this.db.query<ComplianceStatusRow>({
      text: `select * from v_compliance_status where tenant_id = $1 and bom_id = $2`,
      values: [tenantId, bomId]
    });
  }

  async findComponentSuppliers(tenantId: TenantID, partNumbers: string[]): Promise<Map<string, UUID[]>> {
    if (partNumbers.length === 0) {
      return new Map();
    }
    const unique = Array.from(new Set(partNumbers));
    const rows = await this.db.query<{ partNumber: string; supplierId: UUID }>({
      text: `select part_number as "partNumber", supplier_id as "supplierId"
             from component_suppliers
             where tenant_id = $1
               and part_number = any($2::text[])`,
      values: [tenantId, unique]
    });
    const map = new Map<string, UUID[]>();
    for (const row of rows) {
      const current = map.get(row.partNumber) ?? [];
      current.push(row.supplierId);
      map.set(row.partNumber, current);
    }
    return map;
  }

  async recordIngestionIssue(issue: IngestionIssueInput): Promise<void> {
    await this.db.query({
      text: `insert into ingestion_issues (tenant_id, bom_id, part_number, code, message)
             values ($1, $2, $3, $4, $5)`,
      values: [issue.tenantId, issue.bomId, issue.partNumber ?? null, issue.code, issue.message]
    });
  }

  async insertCertificate(record: PersistableCertificate): Promise<Certificate> {
    const [row] = await this.db.query<Certificate>({
      text: `insert into certificates
             (tenant_id, supplier_id, part_number, type, declaration_date, valid_until, threshold_ppm, document_limit_source, source_doc_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             returning *`,
      values: [
        record.tenantId,
        record.supplierId,
        record.partNumber,
        record.type,
        record.declarationDate ?? null,
        record.validUntil ?? null,
        record.thresholdPpm ?? null,
        record.documentLimitSource ?? null,
        record.sourceDocId ?? null
      ]
    });
    if (!row) {
      throw new Error('Failed to insert certificate');
    }
    return row;
  }

  async insertCertificateFindings(records: PersistableCertificateFinding[]): Promise<void> {
    for (const record of records) {
      await this.db.query({
        text: `insert into certificate_findings
               (certificate_id, substance_name, concentration_value, concentration_unit, concentration_ppm, concentration_raw, data_quality)
               values ($1,$2,$3,$4,$5,$6,$7)`,
        values: [
          record.certificateId,
          record.substanceName,
          record.concentrationValue ?? null,
          record.concentrationUnit ?? null,
          record.concentrationPpm ?? null,
          record.concentrationRaw ?? null,
          record.dataQuality ?? null
        ]
      });
    }
  }

  async recordAuditLog(entry: AuditLogInsert): Promise<void> {
    await this.db.query({
      text: `
        insert into audit_logs (tenant_id, actor_user_id, action, target, payload_json)
        values ($1,$2,$3,$4,$5::jsonb)
      `,
      values: [entry.tenantId, entry.actorUserId ?? null, entry.action, entry.target, entry.payload ?? null]
    });
  }
}
