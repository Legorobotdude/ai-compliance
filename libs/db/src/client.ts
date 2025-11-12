import { Pool, PoolClient, type PoolConfig } from 'pg';
import { TenantID } from './schema.js';
import { getTenantContext } from './tenant-context.js';

export interface QueryConfig {
  text: string;
  values?: ReadonlyArray<unknown>;
}

export interface DatabaseClient {
  query<T = unknown>(config: QueryConfig): Promise<T[]>;
  withTransaction<T>(callback: (tx: DatabaseClient) => Promise<T>): Promise<T>;
}

export interface TenantScopedDb {
  tenantId: TenantID;
  db: DatabaseClient;
}

class PgPoolDatabaseClient implements DatabaseClient {
  constructor(private readonly pool: Pool) {}

  async query<T = unknown>(config: QueryConfig): Promise<T[]> {
    const pgConfig = {
      text: config.text,
      values: config.values as unknown[] | undefined
    };
    const client = await this.pool.connect();
    const contextApplied = await applyTenantContext(client);
    try {
      const result = await client.query(pgConfig);
      return result.rows as T[];
    } finally {
      if (contextApplied) {
        await resetTenantContext(client);
      }
      client.release();
    }
  }

  async withTransaction<T>(callback: (tx: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const contextApplied = await applyTenantContext(client);
    try {
      await client.query('BEGIN');
      const transactional = new PgSingleClient(client);
      const result = await callback(transactional);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (contextApplied) {
        await resetTenantContext(client);
      }
      client.release();
    }
  }
}

class PgSingleClient implements DatabaseClient {
  constructor(private readonly client: PoolClient) {}

  async query<T = unknown>(config: QueryConfig): Promise<T[]> {
    const pgConfig = {
      text: config.text,
      values: config.values as unknown[] | undefined
    };
    const result = await this.client.query(pgConfig);
    return result.rows as T[];
  }

  // Nested transactions add complexity; wrap callers instead.
  async withTransaction<T>(): Promise<T> {
    throw new Error('Nested transactions are not supported in PgSingleClient');
  }
}

export interface PgClientFactoryResult {
  pool: Pool;
  db: DatabaseClient;
}

export type PgClientConfig = PoolConfig;

export function createPgDatabaseClient(config: PgClientConfig): PgClientFactoryResult {
  const pool = new Pool(config);
  const db = new PgPoolDatabaseClient(pool);
  return { pool, db };
}

const SET_CONTEXT_SQL = `
select
  set_config('app.current_tenant', $1, false),
  set_config('app.current_roles', $2, false),
  set_config('app.current_user', $3, false)
`;

const RESET_CONTEXT_SQL = `
select
  set_config('app.current_tenant', '', false),
  set_config('app.current_roles', '', false),
  set_config('app.current_user', '', false)
`;

async function applyTenantContext(client: PoolClient): Promise<boolean> {
  const context = getTenantContext();
  if (!context) {
    return false;
  }
  const roles = context.roles?.length ? context.roles.join(',') : '';
  const userId = context.userId ?? '';
  await client.query(SET_CONTEXT_SQL, [context.tenantId, roles, userId]);
  return true;
}

async function resetTenantContext(client: PoolClient): Promise<void> {
  await client.query(RESET_CONTEXT_SQL);
}
