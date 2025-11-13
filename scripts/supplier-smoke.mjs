#!/usr/bin/env node
/**
 * CLI smoke test for the Supplier module described in Architecture.md §5.
 *
 * Validates `/supplier/scorecard` and `/supplier/request`, ensures a supplier
 * request row is persisted, and confirms the dashboard sample suppliers have
 * blocked parts + KPIs wired before deeper development.
 *
 * Usage:
 *   node scripts/supplier-smoke.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

// Load .dev.env if present
const envPath = resolve(ROOT_DIR, '.dev.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  console.log(`🔧 Loading ${envPath}`);
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0 && !process.env[key]) {
      const value = valueParts.join('=').replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.warn(`⚠️  Could not load ${envPath}:`, error.message);
  }
}

// Defaults aligned with scripts/dev.sh
process.env.CERTIVO_API_URL = process.env.CERTIVO_API_URL || 'http://localhost:4000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://certivo:certivo@localhost:5432/certivo';
process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret';

const API_TOKEN = requireEnv('CERTIVO_API_TOKEN');
const API_URL = process.env.CERTIVO_API_URL.replace(/\/+$/, '');
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_PAYLOAD = decodeJwtPayload(API_TOKEN);
const TENANT_ID =
  JWT_PAYLOAD?.tenant_id || process.env.CERTIVO_TENANT_ID || '00000000-0000-4000-8000-000000000000';
const HEADERS = {
  Accept: 'application/json',
  Authorization: `Bearer ${API_TOKEN}`
};
const MAX_FETCH_RETRIES = Math.max(1, Number(process.env.SMOKE_FETCH_MAX_RETRIES ?? 3));
const FETCH_RETRY_DELAY_MS = Math.max(100, Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS ?? 500));
const RETRYABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT']);

async function main() {
  banner('Supplier module smoke test');

  section('Fetching dashboard snapshot');
  const snapshot = await apiFetch('/dashboard/snapshot');
  const suppliers = Array.isArray(snapshot?.suppliers) ? snapshot.suppliers : [];
  if (!suppliers.length) {
    throw new Error('Dashboard snapshot returned no suppliers — seed data before running the smoke test.');
  }
  const supplier = suppliers[0];
  logResult('Supplier sample', {
    supplierId: supplier.supplierId,
    name: supplier.name,
    complianceRate: supplier.complianceRate,
    responseAvgDays: supplier.responseAvgDays,
    requestsOpen: supplier.requestsOpen
  });

  section('Calling /supplier/scorecard');
  const scorecard = await apiFetch(`/supplier/scorecard/${supplier.supplierId}`);
  const stats = scorecard?.stats;
  if (!stats) {
    throw new Error('/supplier/scorecard response missing stats field.');
  }
  logResult('Scorecard metrics', {
    complianceRate: stats.complianceRate,
    targetResponseDays: stats.targetResponseDays,
    actualResponseDays: stats.actualResponseDays,
    openRequests: stats.openRequests,
    dueSoon: stats.dueSoon,
    blockedParts: (scorecard.blockedParts ?? []).slice(0, 3)
  });

  const bomId = snapshot?.bom?.id;
  if (!bomId) {
    throw new Error('Dashboard snapshot missing BOM ID — required for creating supplier requests.');
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const requestedBy = await fetchRequesterId(client, TENANT_ID);

    section('Creating supplier request via /supplier/request');
    const createPayload = {
      tenantId: TENANT_ID,
      supplierId: supplier.supplierId,
      bomId,
      requestedBy,
      tone: 'formal',
      languageOverride: supplier.language
    };
    const createResponse = await apiFetch('/supplier/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload)
    });
    logResult('Supplier request response', createResponse);

    section('Verifying supplier_requests row');
    const persisted = await fetchSupplierRequest(client, createResponse.requestId);
    logResult('Persisted request', {
      status: persisted.status,
      dueAt: persisted.due_at,
      sentAt: persisted.sent_at,
      requestedBy: persisted.requested_by,
      bomId: persisted.bom_id
    });
  } finally {
    await client.end();
  }

  banner('Supplier module smoke test completed ✅');
}

main().catch((error) => {
  console.error('\n❌ Supplier smoke test failed');
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

async function apiFetch(path, init = {}, attempt = 1) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const requestInit = {
    ...init,
    headers: {
      ...HEADERS,
      ...(init.headers ?? {})
    }
  };
  let response;
  try {
    response = await fetch(url, requestInit);
  } catch (error) {
    if (attempt < MAX_FETCH_RETRIES && shouldRetryFetchError(error)) {
      const delay = getRetryDelayMs(attempt);
      console.warn(
        `   fetch retry ${attempt}/${MAX_FETCH_RETRIES} for ${url}: ${describeFetchError(error)} (waiting ${delay}ms)`
      );
      await sleep(delay);
      return apiFetch(path, init, attempt + 1);
    }
    throw enrichNetworkError(error, path, attempt);
  }
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

async function fetchRequesterId(client, tenantId) {
  const result = await client.query(
    `select id
     from users
     where tenant_id = $1
     order by created_at asc
     limit 1`,
    [tenantId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`No users found for tenant ${tenantId}; seed sample users before running the smoke test.`);
  }
  return row.id;
}

async function fetchSupplierRequest(client, requestId) {
  const result = await client.query(
    `select id, status, due_at, sent_at, requested_by, bom_id
     from supplier_requests
     where id = $1`,
    [requestId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`supplier_requests entry ${requestId} not found — insert failed.`);
  }
  return row;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function decodeJwtPayload(token) {
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
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

function shouldRetryFetchError(error) {
  const code = error?.cause?.code ?? error?.code;
  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }
  return error?.name === 'TypeError' && !error?.status;
}

function getRetryDelayMs(attempt) {
  const backoff = FETCH_RETRY_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(backoff, 2000);
}

function describeFetchError(error) {
  const code = error?.cause?.code ?? error?.code;
  const message = error?.message ?? String(error);
  return code ? `${code} ${message}` : message;
}

function enrichNetworkError(error, path, attempt) {
  const enriched = new Error(`Request to ${path} failed after ${attempt} attempt(s): ${describeFetchError(error)}`);
  enriched.cause = error;
  return enriched;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
