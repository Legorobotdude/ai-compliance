import type {
  ComplianceStatusRow,
  DatabaseClient,
  Regulation,
  RegulationLimit,
  RegulationScenarioDelta,
  TenantID,
  UUID
} from '@certivo/lib-db';

export class RiskRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findRegulationByCode(code: string): Promise<Regulation | null> {
    const rows = await this.db.query<Regulation>({
      text: `select * from regulations where code = $1 order by effective_date desc limit 1`,
      values: [code]
    });
    return rows[0] ?? null;
  }

  async listLimits(regulationId: UUID): Promise<RegulationLimit[]> {
    return this.db.query<RegulationLimit>({
      text: `select * from regulation_limits where regulation_id = $1`,
      values: [regulationId]
    });
  }

  async fetchStatusRows(tenantId: TenantID, bomId?: UUID): Promise<ComplianceStatusRow[]> {
    const clause = bomId ? 'and bom_id = $2' : '';
    const values = bomId ? [tenantId, bomId] : [tenantId];
    return this.db.query<ComplianceStatusRow>({
      text: `select * from v_compliance_status where tenant_id = $1 ${clause}`,
      values
    });
  }

  async recordScenarioResult(payload: { tenantId: TenantID; regulationCode: string; deltas: RegulationScenarioDelta[] }) {
    await this.db.query({
      text: `insert into impact_scenarios (tenant_id, regulation_code, payload)
             values ($1, $2, $3::jsonb)`,
      values: [payload.tenantId, payload.regulationCode, payload.deltas]
    });
  }
}
