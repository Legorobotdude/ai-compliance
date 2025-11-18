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

type ComplianceStatus = ComplianceStatusRow['status'];

interface FetchMergedViewOptions {
  limit?: number;
  offset?: number;
  status?: ComplianceStatus;
  query?: string;
}

const COMPLIANCE_STATUSES: ComplianceStatus[] = ['COMPLIANT', 'MISSING', 'EXPIRED', 'OVER_LIMIT'];

export class ComplianceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async withTransaction<T>(callback: (repo: ComplianceRepository) => Promise<T>): Promise<T> {
    return this.db.withTransaction((tx) => callback(new ComplianceRepository(tx)));
  }

  async upsertProduct(payload: { tenantId: TenantID; productName: string; code: string }): Promise<{ id: UUID; code: string }> {
    const [result] = await this.db.query<{ id: UUID; code: string }>({
      text: `
        insert into products (tenant_id, product_name, code)
        values ($1,$2,$3)
        on conflict (tenant_id, code) do update set product_name = excluded.product_name
        returning id, code
      `,
      values: [payload.tenantId, payload.productName, payload.code]
    });
    if (!result) {
      throw new Error('Failed to upsert product');
    }
    return result;
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

  async fetchMergedView(
    tenantId: TenantID,
    bomId: UUID,
    options: FetchMergedViewOptions = {}
  ): Promise<{
    items: ComplianceStatusRow[];
    pagination: { limit: number; offset: number; total: number; hasMore: boolean };
    summary: { total: number; counts: Record<ComplianceStatus, number> };
  }> {
    const limit = Math.min(Math.max(options.limit ?? 100, 25), 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const query = options.query?.trim();

    const baseConditions = [`tenant_id = $1`, `bom_id = $2`];
    const baseValues: Array<TenantID | UUID | string> = [tenantId, bomId];
    let nextIndex = 3;

    if (query) {
      baseConditions.push(`(part_number ilike $${nextIndex} or assembly_id ilike $${nextIndex})`);
      baseValues.push(`%${query}%`);
      nextIndex += 1;
    }

    const summaryCountsRows = await this.db.query<{ status: ComplianceStatus; count: number }>({
      text: `
        select status, count(*)::int as count
        from v_compliance_status
        where ${baseConditions.join(' and ')}
        group by status
      `,
      values: baseValues
    });

    const summaryCounts: Record<ComplianceStatus, number> = COMPLIANCE_STATUSES.reduce(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<ComplianceStatus, number>
    );
    for (const row of summaryCountsRows) {
      summaryCounts[row.status] = row.count;
    }
    const summaryTotal = Object.values(summaryCounts).reduce((total, count) => total + count, 0);

    const dataConditions = [...baseConditions];
    const dataValues = [...baseValues];
    let dataIndex = nextIndex;

    if (options.status) {
      dataConditions.push(`status = $${dataIndex}`);
      dataValues.push(options.status);
      dataIndex += 1;
    }

    const totalRows = await this.db.query<{ total: number }>({
      text: `
        select count(*)::int as total
        from v_compliance_status
        where ${dataConditions.join(' and ')}
      `,
      values: dataValues
    });
    const total = totalRows[0]?.total ?? 0;

    const items = await this.db.query<ComplianceStatusRow>({
      text: `
        select *
        from v_compliance_status
        where ${dataConditions.join(' and ')}
        order by part_number asc, assembly_id asc
        limit $${dataIndex}
        offset $${dataIndex + 1}
      `,
      values: [...dataValues, limit, offset]
    });

    const hasMore = offset + items.length < total;

    return {
      items,
      pagination: {
        limit,
        offset,
        total,
        hasMore
      },
      summary: {
        total: summaryTotal,
        counts: summaryCounts
      }
    };
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
