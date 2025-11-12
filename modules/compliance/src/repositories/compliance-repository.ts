import type {
  Bom,
  BomComponent,
  BomSubassembly,
  ComplianceStatusRow,
  DatabaseClient,
  TenantID,
  UUID
} from '@certivo/lib-db';
import type { IngestionIssueInput, PersistableBom } from '../dtos/bom-dtos';

export interface BomAggregate {
  bom: Bom;
  subassemblies: BomSubassembly[];
  components: BomComponent[];
}

export class ComplianceRepository {
  constructor(private readonly db: DatabaseClient) {}

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

  async recordIngestionIssue(issue: IngestionIssueInput): Promise<void> {
    await this.db.query({
      text: `insert into ingestion_issues (tenant_id, bom_id, part_number, code, message)
             values ($1, $2, $3, $4, $5)`,
      values: [issue.tenantId, issue.bomId, issue.partNumber ?? null, issue.code, issue.message]
    });
  }
}
