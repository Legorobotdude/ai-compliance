#!/usr/bin/env node
/**
 * CLI smoke test for the Search/RAG module described in Architecture.md §§1 & 4.
 *
 * Validates the ingestion + retrieval path (POST /rag/documents, GET /search)
 * and ensures CORA chat consumes retrieved snippets via /ai/chat.
 *
 * Usage:
 *   node scripts/rag-smoke.mjs
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
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0 && !process.env[key]) {
      const value = valueParts.join('=').replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    }
  });
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.warn(`⚠️  Could not load ${envPath}:`, error.message);
  }
}

process.env.CERTIVO_API_URL = process.env.CERTIVO_API_URL || 'http://localhost:4000';
process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-secret';

const API_TOKEN = requireEnv('CERTIVO_API_TOKEN');
const API_URL = process.env.CERTIVO_API_URL.replace(/\/+$/, '');
const HEADERS = {
  Accept: 'application/json',
  Authorization: `Bearer ${API_TOKEN}`
};
const MAX_FETCH_RETRIES = Math.max(1, Number(process.env.SMOKE_FETCH_MAX_RETRIES ?? 3));
const FETCH_RETRY_DELAY_MS = Math.max(100, Number(process.env.SMOKE_FETCH_RETRY_DELAY_MS ?? 500));
const RETRYABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT']);

async function main() {
  banner('Search/RAG + CORA chat smoke test');

  section('Baseline semantic search');
  const baselineResults = await apiFetch('/search?q=pfas&topK=3');
  if (!Array.isArray(baselineResults) || baselineResults.length === 0) {
    throw new Error('Expected seeded PFAS documents from /search — run pnpm db:seed first.');
  }
  logResult('Seeded PFAS result', {
    documentTitle: baselineResults[0]?.documentTitle,
    score: baselineResults[0]?.score,
    sourceType: baselineResults[0]?.sourceType
  });

  section('Ingesting ad-hoc smoke document');
  const uniqueSuffix = Date.now();
  const sourceKey = `rag-smoke:${uniqueSuffix}`;
  const uniquePhrase = `regenerative compliance beacon ${uniqueSuffix}`;
  const ingestPayload = {
    sourceKey,
    title: `Smoke doc ${uniqueSuffix}`,
    sourceType: 'NOTE',
    description: 'Ephemeral document inserted by rag-smoke.mjs',
    content: `This is a synthetic document to validate the Search/RAG pipeline.\n\n` +
      `Focus phrase: ${uniquePhrase}. Architecture.md requires grounded context for chat responses.\n` +
      `Any reply should cite this smoke document when asked about the focus phrase.`,
    metadata: { test: 'rag-smoke', insertedAt: new Date().toISOString() }
  };
  const ingestResult = await apiFetch('/rag/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ingestPayload)
  });
  logResult('Ingestion response', ingestResult);

  section('Verifying retrieval for unique phrase');
  const targetedResults = await apiFetch(`/search?q=${encodeURIComponent(uniquePhrase)}&topK=3`);
  if (!Array.isArray(targetedResults) || targetedResults.length === 0) {
    throw new Error('Search did not return the ingested smoke document.');
  }
  if (targetedResults[0]?.sourceKey !== sourceKey) {
    console.warn('⚠️  Smoke document was not the top hit; continuing but inspect ranking.');
  }
  const expectedChunkId = targetedResults[0]?.id;
  logResult('Targeted search result', targetedResults[0]);

  section('CORA chat grounded response');
  const chatPayload = {
    messages: [
      {
        role: 'user',
        content: `Summarize the focus phrase "${uniquePhrase}" and cite the smoke document.`
      }
    ],
    topK: 5,
    filters: { sourceKeys: [sourceKey] }
  };
  const chatResponse = await apiFetch('/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatPayload)
  });
  // Log full response immediately so it's visible even if validation fails
  logResult('Full CORA chat response', chatResponse);
  const citations = Array.isArray(chatResponse?.citations) ? chatResponse.citations : [];
  if (!citations.length) {
    throw new Error('CORA chat returned no citations for the filtered sourceKey.');
  }
  // Validate that the citation references the expected chunk (by chunkId)
  const smokeCitation = citations.find((citation) => citation.chunkId === expectedChunkId);
  if (!smokeCitation) {
    throw new Error(`CORA chat did not cite the smoke document chunk. Expected chunkId: ${expectedChunkId}, found citations: ${JSON.stringify(citations.map(c => c.chunkId))}`);
  }
  // Get source title from context if available
  const citedSourceTitle = chatResponse.context?.results?.find(r => r.id === smokeCitation.chunkId)?.documentTitle || 'N/A';
  logResult('Chat response summary', {
    conversationId: chatResponse.conversationId,
    replyPreview: chatResponse.reply?.slice(0, 120),
    citationChunk: smokeCitation.chunkId,
    citationSource: citedSourceTitle
  });

  banner('Search/RAG smoke test completed ✅');
}

main().catch((error) => {
  console.error('\n❌ Search/RAG smoke test failed');
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
  try {
    const response = await fetch(url, requestInit);
    if (!response.ok) {
      const body = await safeJson(response);
      const error = new Error(`Request failed (${response.status})`);
      error.status = response.status;
      error.responseBody = body;
      throw error;
    }
    return await safeJson(response);
  } catch (error) {
    if (
      attempt < MAX_FETCH_RETRIES &&
      (RETRYABLE_ERROR_CODES.has(error?.code) || error?.name === 'FetchError')
    ) {
      await delay(FETCH_RETRY_DELAY_MS);
      return apiFetch(path, init, attempt + 1);
    }
    throw error;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for this smoke test.`);
  }
  return value;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function safeJson(response) {
  return response
    .text()
    .then((text) => (text ? JSON.parse(text) : null))
    .catch(() => null);
}

function banner(message) {
  console.log(`\n==============================`);
  console.log(message);
  console.log(`==============================`);
}

function section(title) {
  console.log(`\n▶ ${title}`);
}

function logResult(label, payload) {
  console.log(`  ${label}:`);
  console.dir(payload, { depth: 4, colors: true });
}
