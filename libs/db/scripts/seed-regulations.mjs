import crypto from 'node:crypto';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://certivo:certivo@localhost:5432/certivo';

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

async function upsertRegulations(client) {
  const regs = [
    {
      id: deterministicUuid('regulation:rohs'),
      code: 'ROHS',
      name: 'Restriction of Hazardous Substances',
      region: 'EU',
      version: '2023',
      effectiveDate: '2023-12-01',
      limits: [
        { substance: 'Lead', limit: 1000 },
        { substance: 'Mercury', limit: 1000 },
        { substance: 'Cadmium', limit: 100 },
        { substance: 'Hexavalent Chromium', limit: 1000 },
        { substance: 'PFAS', limit: 50 },
        { substance: 'BPA', limit: 500 },
        { substance: 'Phthalates', limit: 1000 }
      ]
    },
    {
      id: deterministicUuid('regulation:reach'),
      code: 'REACH',
      name: 'Registration, Evaluation, Authorisation and Restriction of Chemicals',
      region: 'EU',
      version: '2024',
      effectiveDate: '2024-01-01',
      limits: [
        { substance: 'Lead', limit: 1000 },
        { substance: 'Nickel Sulfate', limit: 500 },
        { substance: 'PFOA', limit: 50 }
      ]
    },
    {
      id: deterministicUuid('regulation:pfas'),
      code: 'PFAS',
      name: 'PFAS Global Watchlist',
      region: 'Global',
      version: '2025',
      effectiveDate: '2025-01-01',
      limits: [
        { substance: 'PFAS', limit: 50 },
        { substance: 'PFOA', limit: 50 },
        { substance: 'PFOS', limit: 40 }
      ]
    }
  ];

  const insertedRegulations = [];

  for (const reg of regs) {
    await client.query(
      `insert into regulations (id, code, name, region, version, effective_date)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (code, version) do update
         set id = excluded.id,
             name = excluded.name,
             region = excluded.region,
             effective_date = excluded.effective_date`,
      [reg.id, reg.code, reg.name, reg.region, reg.version, reg.effectiveDate]
    );

    insertedRegulations.push({
      code: reg.code,
      name: reg.name,
      region: reg.region,
      version: reg.version,
      limitsCount: reg.limits.length
    });

    for (const limit of reg.limits) {
      await client.query(
        `insert into regulation_limits (id, regulation_id, substance, limit_ppm)
         values ($1, $2, $3, $4)
         on conflict (regulation_id, substance) do update
           set limit_ppm = excluded.limit_ppm`,
        [deterministicUuid(`reglimit:${reg.code}:${limit.substance}`), reg.id, limit.substance, limit.limit]
      );
    }
  }

  return insertedRegulations;
}

async function seedRegulations() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query(`select set_config('app.bypass_rls', 'on', false)`);
    await client.query('begin');

    const regulations = await upsertRegulations(client);

    await client.query('commit');

    console.info(`Seeded ${regulations.length} regulations with substance limits`);
    for (const reg of regulations) {
      console.info(`  ${reg.code} (${reg.version}): ${reg.name} - ${reg.limitsCount} limits`);
    }
  } catch (error) {
    await client.query('rollback');
    console.error('Failed to seed regulations');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.query(`select set_config('app.bypass_rls', 'off', false)`);
    client.release();
    await pool.end();
  }
}

seedRegulations();
