#!/usr/bin/env node
/**
 * Supplier workflow scheduler smoke test (Architecture.md §5).
 *
 * Verifies that `/supplier/request` not only persists a supplier request but
 * also enqueues the Temporal workflow via `WorkflowService.queueSupplierWorkflow`
 * by asserting the `workflow_events` table records the
 * `SupplierRequestWorkflow.REQUESTED` payload for the new request.
 *
 * Usage:
 *   node scripts/supplier-workflow-smoke.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client as PgClient } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

// Load .dev.env if present to mirror scripts/dev.sh defaults
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

// Defaults aligned with local dev helpers
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
const WORKFLOW_EVENT_TIMEOUT_MS = Math.max(2000, Number(process.env.WORKFLOW_SMOKE_TIMEOUT_MS ?? 10000));
const WORKFLOW_EVENT_POLL_MS = Math.max(200, Number(process.env.WORKFLOW_SMOKE_POLL_MS ?? 500));

async function main() {
  banner('Supplier workflow scheduler smoke test');

  section('Fetching dashboard snapshot');
  const snapshot = await apiFetch('/dashboard/snapshot');
  const suppliers = Array.isArray(snapshot?.suppliers) ? snapshot.suppliers : [];
  if (!suppliers.length) {
    throw new Error('Dashboard snapshot returned no suppliers — seed data before running the smoke test.');
  }
  const supplier = suppliers[0];
  logResult('Sample supplier', {
    supplierId: supplier.supplierId,
    name: supplier.name,
    responseAvgDays: supplier.responseAvgDays
  });

  const bomId = snapshot?.bom?.id;
  if (!bomId) {
    throw new Error('Dashboard snapshot missing BOM ID — required for supplier requests.');
  }

  const db = new PgClient({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    const requestedBy = await fetchRequesterId(db, TENANT_ID);

    section('Creating supplier request');
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
    if (!createResponse?.requestId) {
      throw new Error('Supplier request response missing requestId');
    }
    if (!createResponse.workflowScheduled) {
      throw new Error('Workflow scheduler reported false — ensure Temporal wiring is active.');
    }
    logResult('Supplier request created', {
      requestId: createResponse.requestId,
      dueAt: createResponse.dueAt,
      workflowScheduled: createResponse.workflowScheduled
    });

    section('Waiting for workflow_events entry');
    const workflowEvent = await waitForWorkflowEvent(db, {
      tenantId: TENANT_ID,
      requestId: createResponse.requestId,
      timeoutMs: WORKFLOW_EVENT_TIMEOUT_MS,
      pollMs: WORKFLOW_EVENT_POLL_MS
    });
    logResult('Workflow event recorded', workflowEvent);
  } finally {
    await db.end();
  }

  banner('Supplier workflow scheduler smoke test completed ✅');
}

main().catch((error) => {
  console.error('\n❌ Supplier workflow smoke test failed');
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

async function waitForWorkflowEvent(client, { tenantId, requestId, timeoutMs, pollMs }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const event = await fetchWorkflowEvent(client, tenantId, requestId);
    if (event) {
      return event;
    }
    await sleep(pollMs);
  }
  throw new Error(
    `Timed out waiting ${timeoutMs}ms for SupplierRequestWorkflow.REQUESTED event for request ${requestId}`
  );
}

async function fetchWorkflowEvent(client, tenantId, requestId) {
  const result = await client.query(
    `select payload, created_at
       from workflow_events
      where tenant_id = $1
        and workflow = 'SUPPLIER_REQUEST'
        and payload->>'event' = 'SupplierRequestWorkflow.REQUESTED'
        and payload->'trigger'->>'requestId' = $2
      order by created_at desc
      limit 1`,
    [tenantId, requestId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    createdAt: row.created_at,
    event: row.payload?.event,
    trigger: row.payload?.trigger
  };
}

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
