import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const sampleDir = path.join(repoRoot, 'Sample Data');
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://certivo:certivo@localhost:5432/certivo';

const tenantSeedKey = process.env.SEED_TENANT_KEY ?? 'tenant:acme';
const tenantId = process.env.SEED_TENANT_ID ?? deterministicUuid(tenantSeedKey);

/**
 * Generate a deterministic UUID v4 that is RFC 4122 compliant.
 * Uses SHA-1 hash of input and sets the correct version and variant bits.
 */
function deterministicUuid(input) {
  const hash = crypto.createHash('sha1').update(input).digest('hex');

  // Extract UUID components from hash
  const timeLow = hash.slice(0, 8);
  const timeMid = hash.slice(8, 12);
  let timeHiAndVersion = hash.slice(12, 16);
  let clockSeqAndReserved = hash.slice(16, 20);
  const node = hash.slice(20, 32);

  // Set version to 4 (UUID v4) - bits 12-15 of time_hi_and_version
  const versionNibble = parseInt(timeHiAndVersion[0], 16);
  timeHiAndVersion = '4' + (versionNibble & 0x0f).toString(16) + timeHiAndVersion.slice(2);

  // Set variant to RFC 4122 (10xx) - bits 6-7 of clock_seq_hi_and_reserved
  const variantByte = parseInt(clockSeqAndReserved.slice(0, 2), 16);
  const rfc4122Variant = (variantByte & 0x3f) | 0x80;
  clockSeqAndReserved = rfc4122Variant.toString(16).padStart(2, '0') + clockSeqAndReserved.slice(2);

  return `${timeLow}-${timeMid}-${timeHiAndVersion}-${clockSeqAndReserved}-${node}`;
}

async function loadSuppliersFile() {
  const suppliersRaw = await readFile(path.join(sampleDir, 'suppliers.json'), 'utf8');
  return JSON.parse(suppliersRaw);
}

async function upsertSuppliers(client, tenantId, suppliers) {
  const supplierIds = [];
  for (const supplier of suppliers) {
    const supplierId = deterministicUuid(`supplier:${supplier.supplier_id}`);
    await client.query(
      `insert into suppliers (id, tenant_id, name, country, language, compliance_rate, response_avg_days)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         name = excluded.name,
         country = excluded.country,
         language = excluded.language,
         compliance_rate = excluded.compliance_rate,
         response_avg_days = excluded.response_avg_days`,
      [
        supplierId,
        tenantId,
        supplier.name,
        supplier.country,
        supplier.language,
        supplier.compliance_rate,
        supplier.response_avg_days
      ]
    );
    supplierIds.push({
      supplierId: supplier.supplier_id,
      id: supplierId,
      name: supplier.name
    });
  }
  return supplierIds;
}

async function seedSuppliers() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const suppliers = await loadSuppliersFile();

    await client.query(`select set_config('app.bypass_rls', 'on', false)`);
    await client.query('begin');

    const supplierIds = await upsertSuppliers(client, tenantId, suppliers);

    await client.query('commit');

    console.info(`Seeded ${suppliers.length} suppliers for tenant ${tenantId}`);
    for (const supplier of supplierIds) {
      console.info(`  ${supplier.supplierId}: ${supplier.name} (${supplier.id})`);
    }
  } catch (error) {
    await client.query('rollback');
    console.error('Failed to seed suppliers');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.query(`select set_config('app.bypass_rls', 'off', false)`);
    client.release();
    await pool.end();
  }
}

seedSuppliers();
