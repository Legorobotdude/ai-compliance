import { Pool, PoolClient, type PoolConfig } from 'pg';
import { TenantID } from './schema';

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
    const result = await this.pool.query(pgConfig);
    return result.rows as T[];
  }

  async withTransaction<T>(callback: (tx: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
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
