#!/usr/bin/env node
/**
 * CLI smoke test for the Compliance + CORA flows described in Architecture.md §§3–4.
 *
 * Usage:
 *   node scripts/lab-smoke.mjs
 *
 * Environment variables (loaded from .dev.env if present):
 *   CERTIVO_API_URL - API base URL (default: http://localhost:4000)
 *   CERTIVO_API_TOKEN - JWT token (required)
 *   CORA_API_URL - CORA sidecar URL (default: http://localhost:8082)
 *   DATABASE_URL - Postgres connection (default: postgres://certivo:certivo@localhost:5432/certivo)
 *   AUTH_JWT_SECRET - JWT secret (default: dev-secret)
 *   AUTH_ISSUER - JWT issuer (default: https://auth.dev.certivo)
 *   AUTH_AUDIENCE - JWT audience (default: certivo-api)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

// Load .dev.env if present
const envPath = resolve(ROOT_DIR, '.dev.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  console.log(`🔧 Loading ${envPath}`);
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.warn(`⚠️  Could not load ${envPath}:`, err.message);
  }
}

// Set defaults (matching dev.sh)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://certivo:certivo@localhost:5432/certivo';
process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret';
process.env.AUTH_ISSUER = process.env.AUTH_ISSUER || 'https://auth.dev.certivo';
process.env.AUTH_AUDIENCE = process.env.AUTH_AUDIENCE || 'certivo-api';
process.env.CORA_API_URL = process.env.CORA_API_URL || 'http://localhost:8082';
process.env.CERTIVO_API_URL = process.env.CERTIVO_API_URL || 'http://localhost:4000';
process.env.CORA_DATABASE_URL = process.env.CORA_DATABASE_URL || process.env.DATABASE_URL;
process.env.CORA_OPENAI_MODEL = process.env.CORA_OPENAI_MODEL || 'gpt-4o-mini';

// Validate required variables
if (!process.env.CERTIVO_API_TOKEN) {
  console.error('❌ CERTIVO_API_TOKEN is not set.');
  console.error('   Run \'node infra/docker/generate-dev-token.mjs\' and place the token in .dev.env:');
  console.error('   CERTIVO_API_TOKEN="<token>"');
  process.exit(1);
}

const API_URL = process.env.CERTIVO_API_URL.replace(/\/+$/, '');
const API_TOKEN = process.env.CERTIVO_API_TOKEN;
const HEADERS = {
  Accept: 'application/json',
  Authorization: `Bearer ${API_TOKEN}`
};

const SAMPLE_SUPPLIERS = {
  zentech: 'df0a9c2c-1cfa-4d5f-8ef4-4abff724aa23'
};

const SAMPLE_DOCUMENTS = {
  bom: 'e5062ac9-3498-40a3-a9dc-ad0f1792deee',
  rohs: 'f2941dc9-3126-4768-aede-91a5e406d11c'
};

const SAMPLE_ASSEMBLIES = [
  {
    assemblyId: 'SUB-001',
    name: 'Control Unit',
    parentAssemblyId: null,
    components: [
      { partNumber: 'CU-78901', material: 'Copper', weightG: 8.5 },
      { partNumber: 'CU-78902', material: 'Polycarbonate', weightG: 5.1 },
      { partNumber: 'CU-78903', material: 'Solder', weightMg: 1800 }
    ]
  },
  {
    assemblyId: 'SUB-002',
    name: 'Wireless Module',
    parentAssemblyId: null,
    components: [
      { partNumber: 'WM-88210', material: 'Tin-Plated Steel', weightG: 3.3 },
      { partNumber: 'WM-88211', material: 'Beryllium Copper', weightG: 1.2 },
      { partNumber: 'WM-88212', material: 'ABS', weightG: 6.0 }
    ]
  },
  {
    assemblyId: 'SUB-003',
    name: 'Battery Pack',
    parentAssemblyId: null,
    components: [
      { partNumber: 'BP-44001', material: 'Lithium Cobalt Oxide', weightG: 120.7 },
      { partNumber: 'BP-44002', material: 'Graphite', weightG: 23.5 },
      { partNumber: 'BP-44003', material: 'Nickel', weightG: 15.0 }
    ]
  }
];

const SAMPLE_CERTIFICATES = [
  {
    supplierId: SAMPLE_SUPPLIERS.zentech,
    partNumber: 'CU-78901',
    type: 'ROHS',
    declarationDate: '2025-01-05',
    validUntil: '2026-01-05',
    thresholdPpm: 1000,
    sourceDocumentId: SAMPLE_DOCUMENTS.rohs,
    findings: [
      {
        substanceName: 'Lead',
        concentrationValue: 0.04,
        concentrationUnit: '%',
        concentrationRaw: '0.04%'
      },
      {
        substanceName: 'Mercury',
        concentrationValue: 120,
        concentrationUnit: 'ppm',
        concentrationRaw: '120 ppm'
      }
    ]
  },
  {
    supplierId: SAMPLE_SUPPLIERS.zentech,
    partNumber: 'CU-78902',
    type: 'ROHS',
    declarationDate: '2025-01-05',
    validUntil: '2026-01-05',
    thresholdPpm: 1000,
    sourceDocumentId: SAMPLE_DOCUMENTS.rohs,
    findings: [
      {
        substanceName: 'Cadmium',
        concentrationValue: 75,
        concentrationUnit: 'ppm',
        concentrationRaw: '75 ppm'
      }
    ]
  }
];

async function main() {
  banner('Certivo Compliance & CORA CLI lab');
  const uploaderId = decodeJwtSub(API_TOKEN) ?? '45c6686f-886c-4eec-a378-fb8cfed7fcaf';

  const snapshot = await apiFetch('/dashboard/snapshot');
  const bomId = snapshot?.bom?.id;
  if (!bomId) {
    throw new Error('Dashboard snapshot missing BOM ID; seed data before running this script.');
  }

  // Use the seeded product ID (Industrial Smart Hub v2)
  // TODO: Fix dashboard/merged endpoints to return productId
  const productId = '6a5b6fe7-5e26-447f-bc9e-6f6c63928dae';

  section('Uploading sample BOM');
  const bomPayload = {
    productId,
    uploadedBy: uploaderId,
    assemblies: SAMPLE_ASSEMBLIES,
    sourceDocumentId: SAMPLE_DOCUMENTS.bom
  };
  const bomResult = await apiFetch('/bom/upload', {
    method: 'POST',
    body: JSON.stringify(bomPayload),
    headers: { 'Content-Type': 'application/json' }
  });
  logResult('BOM upload', {
    bomId: bomResult.bomId,
    assemblies: bomResult.assemblies,
    components: bomResult.components,
    issues: bomResult.issues.length
  });

  section('Uploading sample certificates');
  const certResult = await apiFetch('/certs/upload', {
    method: 'POST',
    body: JSON.stringify({ certificates: SAMPLE_CERTIFICATES }),
    headers: { 'Content-Type': 'application/json' }
  });
  logResult('Certificate upload', {
    certificates: certResult.items.length,
    issues: certResult.issues.length
  });

  section('Requesting CORA document parse');
  const parseResult = await apiFetch('/ai/parse-document', {
    method: 'POST',
    body: JSON.stringify({ documentId: SAMPLE_DOCUMENTS.rohs, schema: 'certificate_v1' }),
    headers: { 'Content-Type': 'application/json' }
  });
  logResult('Parse document', {
    docRef: parseResult.docRef,
    parts: parseResult.parts.length,
    ambiguities: parseResult.ambiguities.length
  });

  section('Requesting CORA supplier email');
  const emailResult = await apiFetch('/ai/supplier-email', {
    method: 'POST',
    body: JSON.stringify({
      supplierId: SAMPLE_SUPPLIERS.zentech,
      bomId,
      language: 'en',
      tone: 'formal'
    }),
    headers: { 'Content-Type': 'application/json' }
  });
  logResult('Supplier email', {
    subject: emailResult.subject,
    dueDate: emailResult.dueDate
  });

  section('Requesting CORA risk summary');
  const riskResult = await apiFetch('/ai/risk-summary', {
    method: 'POST',
    body: JSON.stringify({ productId }),
    headers: { 'Content-Type': 'application/json' }
  });
  logResult('Risk summary', {
    execSummary: riskResult.execSummary,
    topGaps: riskResult.topGaps.length
  });

  banner('Lab smoke test completed successfully ✅');
}

main().catch((error) => {
  console.error('\n❌ Lab smoke test failed');
  if (error?.status) {
    console.error(`Status: ${error.status}`);
  }
  if (error?.responseBody) {
    console.error('Response body:', JSON.stringify(error.responseBody, null, 2));
  } else {
    console.error(error);
  }
  process.exit(1);
});

async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const init = {
    ...options,
    headers: {
      ...HEADERS,
      ...(options.headers ?? {})
    }
  };
  const response = await fetch(url, init);
  const text = await response.text();
  const parsed = text.length ? safeJson(text) : null;
  if (!response.ok) {
    const error = new Error(`Request to ${path} failed with status ${response.status}`);
    error.status = response.status;
    error.responseBody = parsed;
    throw error;
  }
  return parsed;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

function decodeJwtSub(token) {
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

function banner(message) {
  console.log('\n========================================');
  console.log(message);
  console.log('========================================\n');
}

function section(label) {
  console.log(`\n→ ${label}`);
}

function logResult(label, details) {
  console.log(`   ${label}: ${JSON.stringify(details, null, 2)}`);
}
