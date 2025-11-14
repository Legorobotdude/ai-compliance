#!/usr/bin/env node
/**
 * Temporal workflow smoke test (Architecture.md §1, §211).
 *
 * Ensures the API can create a supplier request with a short SLA, verifies the
 * Temporal client can connect to the configured namespace, and waits for the
 * SupplierRequestWorkflow to reach the ESCALATED stage.
 *
 * Usage:
 *   node scripts/temporal-smoke.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client as PgClient } from 'pg';
import { Connection, WorkflowClient } from '@temporalio/client';
import { SUPPLIER_WORKFLOW_STATE_QUERY } from '@certivo/jobs-workflows';

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
process.env.TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
process.env.TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || 'default';
process.env.TEMPORAL_SUPPLIER_TASK_QUEUE =
  process.env.TEMPORAL_SUPPLIER_TASK_QUEUE || 'supplier-workflows';

const API_TOKEN = requireEnv('CERTIVO_API_TOKEN');
const API_URL = process.env.CERTIVO_API_URL.replace(/\/+$/, '');
const DATABASE_URL = process.env.DATABASE_URL;
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS;
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE;
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
const POLL_INTERVAL_MS = Math.max(500, Number(process.env.TEMPORAL_SMOKE_POLL_INTERVAL_MS ?? 1000));
const WAITING_TIMEOUT_MS = Math.max(5000, Number(process.env.TEMPORAL_SMOKE_WAITING_TIMEOUT_MS ?? 20000));
const ESCALATION_TIMEOUT_MS = Math.max(
  WAITING_TIMEOUT_MS,
  Number(process.env.TEMPORAL_SMOKE_ESCALATION_TIMEOUT_MS ?? 45000)
);
const DUE_OFFSET_MS = Math.max(2000, Number(process.env.TEMPORAL_SMOKE_DUE_OFFSET_MS ?? 8000));

async function main() {
  banner('Temporal workflows smoke test');

  section('Fetching dashboard snapshot');
  const snapshot = await apiFetch('/dashboard/snapshot');
  const suppliers = Array.isArray(snapshot?.suppliers) ? snapshot.suppliers : [];
  if (!suppliers.length) {
    throw new Error('Dashboard snapshot returned no suppliers; seed sample data first.');
  }
  const supplier = suppliers[0];
  const bomId = snapshot?.bom?.id;
  if (!bomId) {
    throw new Error('Dashboard snapshot missing BOM ID; required for supplier requests.');
  }
  logResult('Sample supplier', {
    supplierId: supplier.supplierId,
    name: supplier.name,
    responseAvgDays: supplier.responseAvgDays
  });

  const db = new PgClient({ connectionString: DATABASE_URL });
  await db.connect();
  let connection;
  try {
    const requestedBy = await fetchRequesterId(db, TENANT_ID);

    section('Creating supplier request with short SLA');
    const dueAt = new Date(Date.now() + DUE_OFFSET_MS).toISOString();
    const createPayload = {
      tenantId: TENANT_ID,
      supplierId: supplier.supplierId,
      bomId,
      requestedBy,
      dueAt,
      tone: 'formal',
      languageOverride: supplier.language
    };
    const createResponse = await apiFetch('/supplier/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload)
    });
    if (!createResponse.workflowScheduled) {
      throw new Error('Workflow scheduler returned false; ensure worker wiring is active.');
    }
    logResult('Request created', {
      requestId: createResponse.requestId,
      dueAt,
      workflowScheduled: createResponse.workflowScheduled
    });

    const workflowId = `supplier-request-${createResponse.requestId}`;
    section('Connecting to Temporal');
    connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
    const workflowClient = new WorkflowClient({ connection, namespace: TEMPORAL_NAMESPACE });
    const handle = workflowClient.getHandle(workflowId);

    section('Waiting for workflow to reach WAITING stage');
    const waitingState = await waitForWorkflowState(
      handle,
      (state) => state?.stage === 'WAITING' || state?.stage === 'ESCALATED' || state?.stage === 'COMPLETED',
      WAITING_TIMEOUT_MS
    );
    logResult('Workflow stage', waitingState);

    section('Waiting for workflow to escalate');
    const escalatedState = await waitForWorkflowState(
      handle,
      (state) => state?.stage === 'ESCALATED',
      ESCALATION_TIMEOUT_MS
    );
    logResult('Escalated state', escalatedState);
  } finally {
    if (connection) {
      await connection.close().catch(() => {});
    }
    await db.end();
  }

  banner('Temporal workflows smoke test completed ✅');
}

main().catch((error) => {
  console.error('\n❌ Temporal workflow smoke test failed');
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
    throw new Error(`No users found for tenant ${tenantId}; seed sample users first.`);
  }
  return row.id;
}

async function waitForWorkflowState(handle, predicate, timeoutMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const state = await handle.query(SUPPLIER_WORKFLOW_STATE_QUERY);
      if (predicate(state)) {
        return state;
      }
    } catch (error) {
      lastError = error;
      if (!shouldRetryWorkflowQuery(error)) {
        throw error;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  const err = new Error(`Timed out after ${timeoutMs}ms waiting for workflow state`);
  if (lastError) {
    err.cause = lastError;
  }
  throw err;
}

function shouldRetryWorkflowQuery(error) {
  const transientNames = new Set([
    'WorkflowNotFoundError',
    'WorkflowQueryError',
    'ServiceUnavailableError'
  ]);
  return transientNames.has(error?.name);
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
