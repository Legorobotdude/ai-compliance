#!/usr/bin/env node
/**
 * CLI smoke test for the Risk/Impact service and /impact/predict flow.
 *
 * Usage:
 *   node scripts/risk-impact-smoke.mjs
 *
 * Mirrors the env-loading behavior of scripts/lab-smoke.mjs so devs can quickly
 * validate the regulation slider + scenario persistence described in Architecture.md §5.
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

// Default dev settings (in sync with scripts/dev.sh expectations)
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
  banner('Risk/Impact smoke test');

  section('Fetching dashboard snapshot');
  const snapshot = await apiFetch('/dashboard/snapshot');
  const bomId = snapshot?.bom?.id;
  if (!bomId) {
    throw new Error('Dashboard snapshot missing BOM ID—seed data before running smoke test.');
  }
  verifyRiskAnalytics(snapshot?.risk);
  const regulationCode = snapshot?.impact?.regulation || 'PFAS';
  const baselineLimit = snapshot?.impact?.oldLimitPpm ?? 100;
  const baselineLimits = Array.isArray(snapshot?.impact?.baselineLimits)
    ? snapshot.impact.baselineLimits.filter(
        (limit) => typeof limit?.limitPpm === 'number' && Number.isFinite(limit.limitPpm)
      )
    : [];

  section('Calling /impact/predict with a stricter limit');
  const newLimit = Math.max(1, Math.round(baselineLimit * 0.1));
  const overrideVector =
    baselineLimits.length > 0
      ? baselineLimits.map((limit) => ({
          substance: limit.substance,
          limitPpm: Math.max(1, Math.round(limit.limitPpm * 0.1))
        }))
      : undefined;
  const impact = await apiFetch('/impact/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      regulationCode,
      newLimitPpm: overrideVector ? undefined : newLimit,
      limitVector: overrideVector,
      bomId
    })
  });
  verifyImpactDelta(impact, baselineLimit, overrideVector ? overrideVector[0]?.limitPpm ?? newLimit : newLimit);
  logResult('Impact simulator response', {
    regulation: impact.regulation,
    oldLimitPpm: impact.oldLimitPpm,
    newLimitPpm: impact.newLimitPpm,
    affectedParts: impact.summary?.affectedParts ?? 0,
    affectedSuppliers: impact.summary?.affectedSuppliers ?? 0,
    expiresAtIso: impact.expiresAtIso,
    vector: impact.vector?.slice(0, 2),
    supplierRollupSample: impact.supplierRollups?.slice(0, 2),
    deltasSample: impact.deltas.slice(0, 3)
  });

  section('Verifying scenario persistence + compliance snapshot hydration');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const scenarioRows = await client.query(
      `select regulation_code, payload, created_at
       from impact_scenarios
       where tenant_id = $1
       order by created_at desc
       limit 1`,
      [TENANT_ID]
    );
    if (!scenarioRows.rows.length) {
      throw new Error('No impact_scenarios row found for tenant; repository insert failed.');
    }
    const latestScenario = scenarioRows.rows[0];
    logResult('Latest impact_scenarios row', {
      regulationCode: latestScenario.regulation_code,
      recordedAtIso: latestScenario.payload?.recordedAtIso ?? latestScenario.created_at,
      deltaCount: Array.isArray(latestScenario.payload?.deltas)
        ? latestScenario.payload.deltas.length
        : 0
    });

    const statusRows = await client.query(
      `select count(*)::int as count
       from v_compliance_status
       where tenant_id = $1
         and bom_id = $2`,
      [TENANT_ID, bomId]
    );
    logResult('Compliance snapshot rows', { total: statusRows.rows[0]?.count ?? 0 });
  } finally {
    await client.end();
  }

  banner('Risk/Impact smoke test completed ✅');
}

main().catch((error) => {
  console.error('\n❌ Risk/Impact smoke test failed');
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

function verifyRiskAnalytics(risk) {
  section('Validating risk analytics snapshot');
  if (!risk) {
    throw new Error('Dashboard snapshot missing risk analytics payload; ensure RiskImpactService Phase 3 is wired.');
  }

  const riskScore = risk.riskScore;
  if (!riskScore || typeof riskScore.score !== 'number') {
    throw new Error('Risk analytics missing composite score.');
  }
  if (!Array.isArray(riskScore.components) || riskScore.components.length === 0) {
    throw new Error('Risk analytics missing score components; expected w1–w4 breakdown.');
  }
  logResult('Risk score summary', {
    score: riskScore.score,
    components: riskScore.components.map((component) => ({
      id: component.id,
      penalty: Math.round(component.penalty)
    }))
  });

  if (!Array.isArray(risk.frameworks) || risk.frameworks.length === 0) {
    throw new Error('Risk analytics missing framework coverage slices.');
  }
  logResult('Framework coverage sample', risk.frameworks.slice(0, 3));

  if (!Array.isArray(risk.trend) || risk.trend.length === 0) {
    throw new Error('Risk analytics missing risk trend series.');
  }

  if (!Array.isArray(risk.supplierExposure) || risk.supplierExposure.length === 0) {
    console.warn('⚠️  Risk analytics supplier exposure list empty – verify blocked parts data.');
  } else {
    logResult('Supplier exposure sample', risk.supplierExposure.slice(0, 3));
  }

  if (!Array.isArray(risk.gaps)) {
    throw new Error('Risk analytics gaps field is not an array.');
  }
  logResult('Supplier gap sample', risk.gaps.slice(0, 3));
}

function verifyImpactDelta(impact, baselineLimit, newLimit) {
  if (!impact || typeof impact !== 'object') {
    throw new Error('Impact simulator response missing.');
  }

  const deltas = Array.isArray(impact.deltas) ? impact.deltas : [];
  const summary = impact.summary ?? {};
  const affectedParts = typeof summary.affectedParts === 'number' ? summary.affectedParts : deltas.length;

  if (affectedParts === 0 || deltas.length === 0) {
    throw new Error(
      `Impact simulator returned zero deltas after tightening from ${baselineLimit}ppm to ${newLimit}ppm. ` +
        'Ensure seeded PFAS findings exist (Architecture.md §5 sample data) and that the limit override is applied.'
    );
  }
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
