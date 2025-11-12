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

function deterministicUuid(input) {
  const hash = crypto.createHash('sha1').update(input).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function toNumber(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPpm(value, unit) {
  if (value === null || value === undefined || !unit) {
    return null;
  }
  if (unit === '%') {
    return value * 10000;
  }
  return value;
}

function normalizeWeight(weightMg, weightG) {
  if (typeof weightMg === 'number') {
    return Math.round(weightMg);
  }
  if (typeof weightG === 'number') {
    return Math.round(weightG * 1000);
  }
  return null;
}

function parseRohsCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const [, ...rows] = lines;
  return rows
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [partNumber, substance, concentration, unit, thresholdPpm, certExpiry] = line.split(',');
      return {
        partNumber,
        substance,
        concentration: concentration?.length ? Number(concentration) : null,
        unit: unit || null,
        thresholdPpm: thresholdPpm?.length ? Number(thresholdPpm) : null,
        certExpiry: certExpiry || null
      };
    });
}

function parseReachXml(xmlText) {
  const parts = [];
  const partRegex = /<Part>([\s\S]*?)<\/Part>/g;
  let partMatch;
  while ((partMatch = partRegex.exec(xmlText)) !== null) {
    const chunk = partMatch[1];
    const partNumber = chunk.match(/<PartNumber>(.*?)<\/PartNumber>/)?.[1] ?? null;
    const declarationDate = chunk.match(/<DeclarationDate>(.*?)<\/DeclarationDate>/)?.[1] ?? null;
    const validUntil = chunk.match(/<ValidUntil>(.*?)<\/ValidUntil>/)?.[1] ?? null;
    const substances = [];
    const substanceRegex = /<Substance\s+name="([^"]+)"\s+concentration="([^"]*)"\s+unit="([^"]*)"\s*\/>/g;
    let substanceMatch;
    while ((substanceMatch = substanceRegex.exec(chunk)) !== null) {
      substances.push({
        name: substanceMatch[1],
        concentration: substanceMatch[2]?.length ? Number(substanceMatch[2]) : null,
        unit: substanceMatch[3] || null
      });
    }
    if (partNumber) {
      parts.push({ partNumber, declarationDate, validUntil, substances });
    }
  }
  return parts;
}

async function loadSampleFiles() {
  const [bomRaw, suppliersRaw, rohsRaw, reachRaw] = await Promise.all([
    readFile(path.join(sampleDir, 'bom.json'), 'utf8'),
    readFile(path.join(sampleDir, 'suppliers.json'), 'utf8'),
    readFile(path.join(sampleDir, 'cert_rohs.csv'), 'utf8'),
    readFile(path.join(sampleDir, 'cert_reach.xml'), 'utf8')
  ]);
  return {
    bom: JSON.parse(bomRaw),
    suppliers: JSON.parse(suppliersRaw),
    rohsRows: parseRohsCsv(rohsRaw),
    reachParts: parseReachXml(reachRaw),
    rawFiles: {
      bom: bomRaw,
      rohs: rohsRaw,
      reach: reachRaw
    }
  };
}

async function upsertTenant(client, tenantId) {
  const name = 'Acme Manufacturing';
  await client.query(
    `insert into tenants (id, name, plan)
     values ($1, $2, 'standard')
     on conflict (id) do update set name = excluded.name, plan = excluded.plan`,
    [tenantId, name]
  );
  return tenantId;
}

async function upsertUser(client, tenantId, userId) {
  const email = 'ops@acme.example.com';
  const oidcSub = 'auth0|acme-ops';
  await client.query(
    `insert into users (id, tenant_id, email, role, oidc_sub)
     values ($1, $2, $3, 'ADMIN', $4)
     on conflict (id) do update set email = excluded.email, role = excluded.role, oidc_sub = excluded.oidc_sub`,
    [userId, tenantId, email, oidcSub]
  );
  return userId;
}

async function upsertProduct(client, tenantId, productId, productName) {
  const code = 'IND-SMART-HUB-V2';
  await client.query(
    `insert into products (id, tenant_id, product_name, code)
     values ($1, $2, $3, $4)
     on conflict (id) do update set product_name = excluded.product_name, code = excluded.code`,
    [productId, tenantId, productName, code]
  );
  return productId;
}

async function upsertDocuments(client, tenantId, sample) {
  const nowIso = new Date().toISOString();
  const docs = [
    {
      id: deterministicUuid('doc:bom'),
      filename: 'bom.json',
      mime: 'application/json',
      storageUrl: 's3://sample/bom.json',
      sha256: crypto.createHash('sha256').update(sample.rawFiles.bom).digest('hex'),
      bytes: Buffer.byteLength(sample.rawFiles.bom),
      uploadedAt: nowIso,
      parsedJson: sample.bom
    },
    {
      id: deterministicUuid('doc:rohs'),
      filename: 'cert_rohs.csv',
      mime: 'text/csv',
      storageUrl: 's3://sample/cert_rohs.csv',
      sha256: crypto.createHash('sha256').update(sample.rawFiles.rohs).digest('hex'),
      bytes: Buffer.byteLength(sample.rawFiles.rohs),
      uploadedAt: nowIso,
      parsedJson: null
    },
    {
      id: deterministicUuid('doc:reach'),
      filename: 'cert_reach.xml',
      mime: 'application/xml',
      storageUrl: 's3://sample/cert_reach.xml',
      sha256: crypto.createHash('sha256').update(sample.rawFiles.reach).digest('hex'),
      bytes: Buffer.byteLength(sample.rawFiles.reach),
      uploadedAt: nowIso,
      parsedJson: null
    }
  ];

  for (const doc of docs) {
    await client.query(
      `insert into documents (id, tenant_id, filename, mime, bytes, storage_url, sha256, uploaded_at, parsed_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update
       set filename = excluded.filename,
           mime = excluded.mime,
           bytes = excluded.bytes,
           storage_url = excluded.storage_url,
           sha256 = excluded.sha256,
           parsed_json = excluded.parsed_json`,
      [
        doc.id,
        tenantId,
        doc.filename,
        doc.mime,
        doc.bytes,
        doc.storageUrl,
        doc.sha256,
        doc.uploadedAt,
        doc.parsedJson
      ]
    );
  }

  return {
    bomDocumentId: docs[0].id,
    rohsDocumentId: docs[1].id,
    reachDocumentId: docs[2].id
  };
}

function buildBomPayload(tenantId, productId, userId, bom, sourceDocId) {
  const assemblies = [];
  const components = [];
  for (const assembly of bom.subassemblies ?? []) {
    assemblies.push({
      tenantId,
      bomId: null,
      assemblyId: assembly.assembly_id,
      name: assembly.name,
      parentAssemblyId: assembly.parent_assembly_id ?? null
    });
    for (const component of assembly.components ?? []) {
      const weightG = component.weight_g ?? null;
      const weightMg = component.weight_mg ?? null;
      components.push({
        tenantId,
        bomId: null,
        assemblyId: assembly.assembly_id,
        partNumber: component.part_number,
        material: component.material ?? null,
        weightG,
        weightMg,
        normalizedWeightMg: normalizeWeight(weightMg, weightG)
      });
    }
  }
  return {
    bom: {
      tenantId,
      productId,
      uploadedBy: userId,
      sourceDocId,
      bomExternalId: bom.bom_id ?? 'BOM-SEED-1'
    },
    assemblies,
    components
  };
}

async function ensureBom(client, tenantId, productId, userId, bom, sourceDocId) {
  const existing = await client.query(
    `select id from boms where tenant_id = $1 and bom_external_id = $2 limit 1`,
    [tenantId, bom.bom_id]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }
  const payload = buildBomPayload(tenantId, productId, userId, bom, sourceDocId);
  const { rows } = await client.query(
    `select create_bom($1::jsonb) as id`,
    [JSON.stringify(payload)]
  );
  return rows[0].id;
}

async function upsertSuppliers(client, tenantId, suppliers) {
  const map = new Map();
  for (const supplier of suppliers) {
    const supplierId = deterministicUuid(`supplier:${supplier.supplier_id}`);
    await client.query(
      `insert into suppliers (id, tenant_id, name, country, language, compliance_rate, response_avg_days)
       values ($1,$2,$3,$4,$5,$6,$7)
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
    map.set(supplier.supplier_id, {
      id: supplierId,
      data: supplier
    });
  }
  return map;
}

const componentSupplierAssignments = {
  'SUP-101': ['CU-78901', 'CU-78902', 'CU-78903'],
  'SUP-102': ['WM-88210', 'WM-88211', 'WM-88212'],
  'SUP-103': ['BP-44001', 'BP-44002', 'BP-44003']
};

async function upsertComponentSuppliers(client, tenantId, supplierMap) {
  for (const [supplierCode, parts] of Object.entries(componentSupplierAssignments)) {
    const supplier = supplierMap.get(supplierCode);
    if (!supplier) {
      continue;
    }
    for (const partNumber of parts) {
      await client.query(
        `insert into component_suppliers (id, tenant_id, part_number, supplier_id, sourcing_type)
         values ($1,$2,$3,$4,'PRIMARY')
         on conflict (tenant_id, part_number, supplier_id) do update set sourcing_type = excluded.sourcing_type`,
        [deterministicUuid(`component:${partNumber}:${supplierCode}`), tenantId, partNumber, supplier.id]
      );
    }
  }
}

async function upsertSupplierRequests(client, tenantId, bomId, userId, supplierMap) {
  const requestSeeds = [
    {
      supplierCode: 'SUP-101',
      status: 'SENT',
      sentAt: '2025-03-20T10:00:00Z',
      dueAt: '2025-04-01T00:00:00Z',
      responseAt: null
    },
    {
      supplierCode: 'SUP-102',
      status: 'ESCALATED',
      sentAt: '2025-04-01T12:00:00Z',
      dueAt: '2025-04-18T00:00:00Z',
      responseAt: null
    },
    {
      supplierCode: 'SUP-103',
      status: 'RESPONDED',
      sentAt: '2025-04-10T09:00:00Z',
      dueAt: '2025-04-18T00:00:00Z',
      responseAt: '2025-04-15T15:30:00Z'
    }
  ];

  for (const request of requestSeeds) {
    const supplier = supplierMap.get(request.supplierCode);
    if (!supplier) {
      continue;
    }
    await client.query(
      `insert into supplier_requests (id, tenant_id, supplier_id, bom_id, requested_by, status, sent_at, due_at, response_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update set status = excluded.status, sent_at = excluded.sent_at, due_at = excluded.due_at, response_at = excluded.response_at`,
      [
        deterministicUuid(`supplier_request:${request.supplierCode}:${request.dueAt}`),
        tenantId,
        supplier.id,
        bomId,
        userId,
        request.status,
        request.sentAt,
        request.dueAt,
        request.responseAt
      ]
    );
  }
}

function buildPartSupplierMap() {
  const map = new Map();
  for (const [supplierCode, parts] of Object.entries(componentSupplierAssignments)) {
    for (const part of parts) {
      map.set(part, supplierCode);
    }
  }
  return map;
}

function groupRohsCertificates(rohsRows) {
  const grouped = new Map();
  for (const row of rohsRows) {
    const entry = grouped.get(row.partNumber) ?? {
      partNumber: row.partNumber,
      validUntil: row.certExpiry,
      thresholdPpm: row.thresholdPpm,
      findings: []
    };
    if (!entry.validUntil && row.certExpiry) {
      entry.validUntil = row.certExpiry;
    }
    if (entry.thresholdPpm == null && row.thresholdPpm != null) {
      entry.thresholdPpm = row.thresholdPpm;
    }
    entry.findings.push({
      substanceName: row.substance,
      concentrationValue: row.concentration,
      concentrationUnit: row.unit,
      concentrationRaw: row.concentration?.toString() ?? null
    });
    grouped.set(row.partNumber, entry);
  }
  return Array.from(grouped.values());
}

async function upsertCertificates(client, tenantId, supplierMap, partSupplierCodes, rohsData, reachData, documents) {
  const certificates = [];
  for (const entry of groupRohsCertificates(rohsData)) {
    const supplierCode = partSupplierCodes.get(entry.partNumber);
    const supplier = supplierCode ? supplierMap.get(supplierCode) : null;
    if (!supplier) {
      continue;
    }
    certificates.push({
      certificateId: deterministicUuid(`certificate:rohs:${entry.partNumber}`),
      type: 'ROHS',
      partNumber: entry.partNumber,
      supplierId: supplier.id,
      validUntil: entry.validUntil,
      declarationDate: null,
      thresholdPpm: entry.thresholdPpm,
      documentLimitSource: entry.thresholdPpm != null ? 'DOC' : null,
      sourceDocId: documents.rohsDocumentId,
      findings: entry.findings.map((finding) => {
        const unit = finding.concentrationUnit;
        const value = finding.concentrationValue;
        const hasValue = value !== null && value !== undefined;
        const ppm = hasValue && unit ? toPpm(value, unit) : null;
        return {
          substanceName: finding.substanceName,
          concentrationValue: hasValue ? value : null,
          concentrationUnit: unit,
          concentrationPpm: ppm,
          concentrationRaw: finding.concentrationRaw,
          dataQuality: hasValue ? (unit ? 'OK' : 'UNIT_MISSING') : 'VALUE_MISSING'
        };
      })
    });
  }

  for (const part of reachData) {
    const supplierCode = partSupplierCodes.get(part.partNumber);
    const supplier = supplierCode ? supplierMap.get(supplierCode) : null;
    if (!supplier) {
      continue;
    }
    certificates.push({
      certificateId: deterministicUuid(`certificate:reach:${part.partNumber}`),
      type: 'REACH',
      partNumber: part.partNumber,
      supplierId: supplier.id,
      validUntil: part.validUntil,
      declarationDate: part.declarationDate,
      thresholdPpm: null,
      documentLimitSource: 'REGULATION',
      sourceDocId: documents.reachDocumentId,
      findings: part.substances.map((substance) => {
        const unit = substance.unit;
        const value = substance.concentration;
        const ppm = value != null && unit ? toPpm(value, unit) : null;
        return {
          substanceName: substance.name,
          concentrationValue: value,
          concentrationUnit: unit,
          concentrationPpm: ppm,
          concentrationRaw: value?.toString() ?? null,
          dataQuality: value == null ? 'VALUE_MISSING' : unit ? 'OK' : 'UNIT_MISSING'
        };
      })
    });
  }

  for (const cert of certificates) {
    const { rows } = await client.query(
      `insert into certificates (id, tenant_id, supplier_id, part_number, type, declaration_date, valid_until, threshold_ppm, document_limit_source, source_doc_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (id) do update set
         supplier_id = excluded.supplier_id,
         valid_until = excluded.valid_until,
         threshold_ppm = excluded.threshold_ppm,
         document_limit_source = excluded.document_limit_source,
         source_doc_id = excluded.source_doc_id
       returning id`,
      [
        cert.certificateId,
        tenantId,
        cert.supplierId,
        cert.partNumber,
        cert.type,
        cert.declarationDate,
        cert.validUntil,
        cert.thresholdPpm,
        cert.documentLimitSource,
        cert.sourceDocId
      ]
    );
    const certificateId = rows[0].id;
    await client.query(`delete from certificate_findings where certificate_id = $1`, [certificateId]);
    for (const finding of cert.findings) {
      await client.query(
        `insert into certificate_findings (certificate_id, substance_name, concentration_value, concentration_unit, concentration_ppm, concentration_raw, data_quality)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          certificateId,
          finding.substanceName,
          finding.concentrationValue,
          finding.concentrationUnit,
          finding.concentrationPpm,
          finding.concentrationRaw,
          finding.dataQuality
        ]
      );
    }
  }
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
        { substance: 'PFOA', limit: 50 },
        { substance: 'PFOS', limit: 40 }
      ]
    }
  ];

  for (const reg of regs) {
    await client.query(
      `insert into regulations (id, code, name, region, version, effective_date)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set name = excluded.name, version = excluded.version, effective_date = excluded.effective_date`,
      [reg.id, reg.code, reg.name, reg.region, reg.version, reg.effectiveDate]
    );
    for (const limit of reg.limits) {
      await client.query(
        `insert into regulation_limits (id, regulation_id, substance, limit_ppm)
         values ($1,$2,$3,$4)
         on conflict (regulation_id, substance) do update set limit_ppm = excluded.limit_ppm`,
        [deterministicUuid(`reglimit:${reg.code}:${limit.substance}`), reg.id, limit.substance, limit.limit]
      );
    }
  }
}

async function upsertIngestionIssues(client, tenantId, bomId) {
  const issueId = deterministicUuid('issue:cu-78903:value-missing');
  await client.query(
    `insert into ingestion_issues (id, tenant_id, bom_id, part_number, code, message, status)
     values ($1,$2,$3,$4,'VALUE_MISSING',$5,'OPEN')
     on conflict (id) do update set message = excluded.message, status = excluded.status`,
    [issueId, tenantId, bomId, 'CU-78903', 'Missing concentration value flagged during sample seed']
  );
}

async function seed() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const sample = await loadSampleFiles();
    const tenantId = deterministicUuid('tenant:acme');
    const userId = deterministicUuid('user:ops@acme.example.com');
    const productId = deterministicUuid('product:industrial-smart-hub-v2');

    await client.query(`select set_config('app.bypass_rls', 'on', false)`);
    await client.query('begin');
    await upsertTenant(client, tenantId);
    await upsertUser(client, tenantId, userId);
    await upsertProduct(client, tenantId, productId, sample.bom.product_name);
    const documents = await upsertDocuments(client, tenantId, sample);
    const bomId = await ensureBom(client, tenantId, productId, userId, sample.bom, documents.bomDocumentId);
    const supplierMap = await upsertSuppliers(client, tenantId, sample.suppliers);
    await upsertComponentSuppliers(client, tenantId, supplierMap);
    await upsertSupplierRequests(client, tenantId, bomId, userId, supplierMap);
    await upsertRegulations(client);
    const partSupplierCodes = buildPartSupplierMap();
    await upsertCertificates(client, tenantId, supplierMap, partSupplierCodes, sample.rohsRows, sample.reachParts, documents);
    await upsertIngestionIssues(client, tenantId, bomId);
    await client.query('commit');
    console.info(`Seeded sample tenant ${tenantId} with BOM ${sample.bom.bom_id}`);
  } catch (error) {
    await client.query('rollback');
    console.error('Failed to seed sample data');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.query(`select set_config('app.bypass_rls', 'off', false)`);
    client.release();
    await pool.end();
  }
}

seed();
