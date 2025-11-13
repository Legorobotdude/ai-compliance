#!/usr/bin/env node
/**
 * CLI smoke test for the File/Document module flows described in Architecture.md §1.
 * Exercises both inline uploads (base64 payload -> LocalFileStorage) and metadata-only
 * registrations that mimic pre-signed URLs, ensuring documents can be fetched back.
 *
 * Usage:
 *   node scripts/lab-document-smoke.mjs
 *
 * Environment variables (loaded from .dev.env if present):
 *   CERTIVO_API_URL - API base URL (default: http://localhost:4000)
 *   CERTIVO_API_TOKEN - JWT token (required)
 *   DATABASE_URL - Postgres connection (default: postgres://certivo:certivo@localhost:5432/certivo)
 *   AUTH_JWT_SECRET - JWT secret (default: dev-secret)
 *   AUTH_ISSUER - JWT issuer (default: https://auth.dev.certivo)
 *   AUTH_AUDIENCE - JWT audience (default: certivo-api)
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const STORAGE_STUB_DIR = resolve(ROOT_DIR, '.certivo', 'lab-doc-stubs');

// Load .dev.env if present
const envPath = resolve(ROOT_DIR, '.dev.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  console.log(`🔧 Loading ${envPath}`);
  envContent.split('\n').forEach((line) => {
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
process.env.CERTIVO_API_URL = process.env.CERTIVO_API_URL || 'http://localhost:4000';
process.env.DOCUMENTS_PUBLIC_BASE_URL = process.env.DOCUMENTS_PUBLIC_BASE_URL || process.env.CERTIVO_API_URL;

// Validate required variables
if (!process.env.CERTIVO_API_TOKEN) {
  console.error('❌ CERTIVO_API_TOKEN is not set.');
  console.error('   Run \'node infra/docker/generate-dev-token.mjs\' and place the token in .dev.env:');
  console.error('   CERTIVO_API_TOKEN="<token>"');
  process.exit(1);
}

const API_URL = process.env.CERTIVO_API_URL.replace(/\/+$/, '');
const API_TOKEN = process.env.CERTIVO_API_TOKEN;
const DOCUMENTS_SIGNING_SECRET =
  process.env.DOCUMENTS_SIGNING_SECRET || process.env.AUTH_JWT_SECRET || 'dev-docs-secret';
const DOCUMENTS_BASE_URL = (process.env.DOCUMENTS_PUBLIC_BASE_URL || process.env.CERTIVO_API_URL).replace(/\/+$/, '');
const RAW_URL_TTL_MS = Number(process.env.DOCUMENTS_LAB_RAW_TTL_MS || 120_000);
const HEADERS = {
  Accept: 'application/json',
  Authorization: `Bearer ${API_TOKEN}`
};

const SAMPLE_INLINE_DOC = {
  filename: 'lab-bom.csv',
  mime: 'text/csv',
  buffer: Buffer.from(
    [
      'Part Number,Description,Material,Weight (g)',
      'CU-100,Shield Assembly,Aluminum,7.4',
      'CU-200,Control Daughterboard,FR4,2.1',
      'CU-300,Power Harness,Copper,1.3'
    ].join('\n'),
    'utf8'
  )
};

const SAMPLE_PRESIGNED_DOC = {
  filename: 'sensor-spec.txt',
  mime: 'text/plain',
  buffer: Buffer.from(
    [
      'Spec Title: Temp Sensor Envelope',
      'Document Type: Calibration Memo',
      'Notes: This stub mimics a pre-uploaded object referenced by storageUrl.'
    ].join('\n'),
    'utf8'
  )
};

async function main() {
  banner('Certivo File/Document CLI lab');

  section('Uploading inline (base64) document');
  const inlineAttempt = await uploadInlineWithFallback(SAMPLE_INLINE_DOC);
  logResult('Inline upload stored', { ...summarizeDoc(inlineAttempt.doc), mode: inlineAttempt.mode });

  section('Fetching inline document metadata');
  const inlineFetched = await fetchDocument(inlineAttempt.doc.id);
  assertDocumentMetadata(inlineFetched, inlineAttempt.payload);
  logResult('Inline fetch verified', summarizeDoc(inlineFetched));

  section('Downloading inline document via signed /documents/raw');
  await verifyRawDownload('inline', inlineFetched, SAMPLE_INLINE_DOC.buffer);

  section('Registering pre-signed document reference');
  const stubStorageUrl = await persistStubFile(SAMPLE_PRESIGNED_DOC);
  const presignedPayload = buildPresignedPayload(SAMPLE_PRESIGNED_DOC, stubStorageUrl);
  const presignedDoc = await uploadDocument(presignedPayload);
  logResult('Pre-signed upload stored', summarizeDoc(presignedDoc));

  section('Fetching pre-signed document metadata');
  const presignedFetched = await fetchDocument(presignedDoc.id);
  assertDocumentMetadata(presignedFetched, presignedPayload);
  logResult('Pre-signed fetch verified', summarizeDoc(presignedFetched));

  section('Downloading pre-signed document via signed /documents/raw');
  await verifyRawDownload('presigned', presignedFetched, SAMPLE_PRESIGNED_DOC.buffer);

  banner('File/Document smoke test completed successfully ✅');
}

main().catch((error) => {
  console.error('\\n❌ File/Document smoke test failed');
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

async function uploadDocument(payload) {
  return apiFetch('/documents/upload', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });
}

async function uploadInlineWithFallback(doc) {
  const inlinePayload = buildInlinePayload(doc);
  try {
    const uploaded = await uploadDocument(inlinePayload);
    return { doc: uploaded, payload: inlinePayload, mode: 'inline' };
  } catch (error) {
    if (!shouldFallbackToStorageUrl(error)) {
      throw error;
    }
    console.warn('⚠️  Inline uploads unsupported by current API build, falling back to storageUrl');
    const fallbackUrl = await persistStubFile(doc);
    const fallbackPayload = buildPresignedPayload(doc, fallbackUrl);
    const uploaded = await uploadDocument(fallbackPayload);
    return { doc: uploaded, payload: fallbackPayload, mode: 'presigned-fallback' };
  }
}

async function fetchDocument(documentId) {
  return apiFetch(`/documents/${documentId}`);
}

async function persistStubFile(doc) {
  await mkdir(STORAGE_STUB_DIR, { recursive: true });
  const uniqueName = `${Date.now()}-${randomUUID()}-${doc.filename}`;
  const absolutePath = join(STORAGE_STUB_DIR, uniqueName);
  await writeFile(absolutePath, doc.buffer);
  return pathToFileURL(absolutePath).toString();
}

function buildInlinePayload(doc) {
  return {
    filename: doc.filename,
    mime: doc.mime,
    bytes: doc.buffer.byteLength,
    sha256: sha256Hex(doc.buffer),
    dataBase64: doc.buffer.toString('base64')
  };
}

function buildPresignedPayload(doc, storageUrl) {
  return {
    filename: doc.filename,
    mime: doc.mime,
    bytes: doc.buffer.byteLength,
    sha256: sha256Hex(doc.buffer),
    storageUrl
  };
}

function assertDocumentMetadata(doc, expectedPayload) {
  if (doc.filename !== expectedPayload.filename) {
    throw new Error(`Filename mismatch: expected ${expectedPayload.filename}, got ${doc.filename}`);
  }
  if (doc.sha256 !== expectedPayload.sha256) {
    throw new Error(`sha256 mismatch: expected ${expectedPayload.sha256}, got ${doc.sha256}`);
  }
  if (doc.bytes !== expectedPayload.bytes) {
    throw new Error(`Byte size mismatch: expected ${expectedPayload.bytes}, got ${doc.bytes}`);
  }
}

function summarizeDoc(doc) {
  return {
    documentId: doc.id,
    filename: doc.filename,
    storageUrl: doc.storageUrl,
    uploadStatus: doc.uploadStatus,
    scanStatus: doc.scanStatus
  };
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function shouldFallbackToStorageUrl(error) {
  if (!error || error.status !== 422) {
    return false;
  }
  const details = Array.isArray(error.responseBody?.details) ? error.responseBody.details : [];
  return details.some((item) => typeof item?.message === 'string' && item.message.includes('Unrecognized key: "dataBase64"'));
}

async function verifyRawDownload(label, document, expectedBuffer) {
  const expiresAt = Date.now() + RAW_URL_TTL_MS;
  const tenantId = document.tenantId ?? document.tenant_id ?? process.env.CERTIVO_TENANT_ID;
  const documentId = document.id ?? document.documentId ?? document.document_id;
  if (!tenantId) {
    throw new Error(
      'Document tenant is missing. Export CERTIVO_TENANT_ID or ensure /documents/:id returns tenant information.'
    );
  }
  if (!documentId) {
    throw new Error('Document id is missing from response; cannot verify download.');
  }
  const signature = createHmac('sha256', DOCUMENTS_SIGNING_SECRET)
    .update(`${tenantId}:${documentId}:${expiresAt}`)
    .digest('hex');
  const url = `${DOCUMENTS_BASE_URL}/documents/raw?tenant=${encodeURIComponent(
    tenantId
  )}&doc=${encodeURIComponent(documentId)}&expires=${expiresAt}&sig=${signature}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Signed download for ${label} failed with status ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const originalHash = sha256Hex(expectedBuffer);
  const streamedHash = sha256Hex(buffer);
  if (buffer.length !== expectedBuffer.length || originalHash !== streamedHash) {
    throw new Error(
      `Raw download mismatch for ${label}: expected len/hash ${expectedBuffer.length}/${originalHash}, got ${buffer.length}/${streamedHash}`
    );
  }
  logResult(`Signed download verified (${label})`, {
    bytes: buffer.length,
    sha256: streamedHash
  });
}

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

function banner(message) {
  console.log('\\n========================================');
  console.log(message);
  console.log('========================================\\n');
}

function section(label) {
  console.log(`\\n→ ${label}`);
}

function logResult(label, details) {
  console.log(`   ${label}: ${JSON.stringify(details, null, 2)}`);
}
