import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const migrationsDir = process.env.MIGRATIONS_DIR ?? path.join(repoRoot, 'infra', 'db', 'migrations');
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://certivo:certivo@localhost:5432/certivo';

async function loadMigrations() {
  const files = await readdir(migrationsDir, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      id: name,
      name,
      filepath: path.join(migrationsDir, name)
    }));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      name text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function alreadyApplied(client) {
  const result = await client.query('select id from schema_migrations');
  return new Set(result.rows.map((row) => row.id));
}

async function applyMigration(pool, migration) {
  const sql = await readFile(migration.filepath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations (id, name) values ($1, $2)', [migration.id, migration.name]);
    await client.query('commit');
    console.info(`✔︎ Applied ${migration.name}`);
  } catch (error) {
    await client.query('rollback');
    console.error(`✖ Failed to apply ${migration.name}`);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to run migrations');
    process.exit(1);
  }

  const migrations = await loadMigrations();
  if (migrations.length === 0) {
    console.warn(`No migrations found in ${migrationsDir}`);
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const client = await pool.connect();
    let pending = [];
    try {
      await ensureMigrationsTable(client);
      const applied = await alreadyApplied(client);
      pending = migrations.filter((migration) => !applied.has(migration.id));
    } finally {
      client.release();
    }

    if (pending.length === 0) {
      console.info('Database is already up to date.');
      return;
    }
    for (const migration of pending) {
      await applyMigration(pool, migration);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
