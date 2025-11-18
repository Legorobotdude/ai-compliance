import crypto from 'node:crypto';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://certivo:certivo@localhost:5432/certivo';

const tenantSeedKey = process.env.SEED_TENANT_KEY ?? 'tenant:acme';
const tenantId = process.env.SEED_TENANT_ID ?? deterministicUuid(tenantSeedKey);
const tenantName = process.env.SEED_TENANT_NAME ?? 'Acme Manufacturing';
const tenantPlan = process.env.SEED_TENANT_PLAN ?? 'ENTERPRISE';

const userEmail = process.env.SEED_USER_EMAIL ?? 'ops@acme.example.com';
const userSeedKey = process.env.SEED_USER_KEY ?? `user:${userEmail}`;
const userId = process.env.SEED_USER_ID ?? deterministicUuid(userSeedKey);
const userRole = process.env.SEED_USER_ROLE ?? 'ADMIN';
const userOidcSub = process.env.SEED_USER_OIDC_SUB ?? `auth0|${userEmail}`;

function deterministicUuid(input) {
  const hash = crypto.createHash('sha1').update(input).digest('hex');
  const timeLow = hash.slice(0, 8);
  const timeMid = hash.slice(8, 12);
  let timeHiAndVersion = hash.slice(12, 16);
  let clockSeqAndReserved = hash.slice(16, 20);
  const node = hash.slice(20, 32);
  const versionNibble = parseInt(timeHiAndVersion[0], 16);
  timeHiAndVersion = '4' + (versionNibble & 0x0f).toString(16) + timeHiAndVersion.slice(2);
  const variantByte = parseInt(clockSeqAndReserved.slice(0, 2), 16);
  const rfc4122Variant = (variantByte & 0x3f) | 0x80;
  clockSeqAndReserved = rfc4122Variant.toString(16).padStart(2, '0') + clockSeqAndReserved.slice(2);
  return `${timeLow}-${timeMid}-${timeHiAndVersion}-${clockSeqAndReserved}-${node}`;
}

async function upsertTenant(client) {
  await client.query(
    `insert into tenants (id, name, plan)
     values ($1, $2, $3)
     on conflict (id) do update
       set name = excluded.name,
           plan = excluded.plan`,
    [tenantId, tenantName, tenantPlan]
  );
}

async function upsertUser(client) {
  await client.query(
    `insert into users (id, tenant_id, email, role, oidc_sub)
     values ($1, $2, $3, $4, $5)
     on conflict (tenant_id, email) do update
       set id = excluded.id,
           role = excluded.role,
           oidc_sub = excluded.oidc_sub`,
    [userId, tenantId, userEmail, userRole, userOidcSub]
  );
}

async function seedUser() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query(`select set_config('app.bypass_rls', 'on', false)`);
    await client.query('begin');
    await upsertTenant(client);
    await upsertUser(client);
    await client.query('commit');
    console.info('Seeded tenant and user for BOM uploads');
    console.info(`Tenant ID: ${tenantId}`);
    console.info(`User ID: ${userId} (${userEmail})`);
  } catch (error) {
    await client.query('rollback');
    console.error('Failed to seed user');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.query(`select set_config('app.bypass_rls', 'off', false)`);
    client.release();
    await pool.end();
  }
}

seedUser();
