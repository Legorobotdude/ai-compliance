#!/usr/bin/env node
/**
 * Backfills existing entries from the documents table into the Search/RAG corpus.
 * Targets documents that have not yet been indexed (no regulation_embeddings.documents row).
 *
 * Usage:
 *   node scripts/rag-backfill-documents.mjs
 *
 * Environment:
 *   DATABASE_URL (default postgres://certivo:certivo@localhost:5432/certivo)
 *   DOCUMENTS_LOCAL_ROOT (default <repo>/.certivo/documents)
 *   RAG_BACKFILL_MAX_BYTES (optional override for ingestion size cap, default 768000 bytes)
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';
import { SearchRepository, SearchService } from '../modules/search-rag/dist/index.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://certivo:certivo@localhost:5432/certivo';
const DOCUMENTS_ROOT =
  process.env.DOCUMENTS_LOCAL_ROOT ?? path.join(process.cwd(), '.certivo', 'documents');
const MAX_BYTES = Number(process.env.RAG_BACKFILL_MAX_BYTES ?? 768_000);

const TEXT_MIME_PREFIXES = ['text/'];
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/xhtml+xml',
  'application/csv',
  'application/vnd.ms-excel'
]);

class SingleConnectionDbClient {
  constructor(client) {
    this.client = client;
  }

  async query(config) {
    const result = await this.client.query(config.text, config.values);
    return result.rows;
  }

  async withTransaction(callback) {
    await this.client.query('BEGIN');
    try {
      const transactional = new SingleConnectionDbClient(this.client);
      const output = await callback(transactional);
      await this.client.query('COMMIT');
      return output;
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }
}

async function main() {
  console.log('🔍 Starting document → RAG backfill');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`select set_config('app.bypass_rls', 'on', false)`);
    const db = new SingleConnectionDbClient(client);
    const searchRepo = new SearchRepository(db);
    const searchService = new SearchService(searchRepo);

    const documents = await db.query({
      text: `
        select
          d.id,
          d.tenant_id as "tenantId",
          d.filename,
          d.mime,
          d.bytes,
          d.storage_url as "storageUrl",
          d.storage_bucket as "storageBucket",
          d.storage_key as "storageKey",
          d.sha256,
          d.uploaded_at as "uploadedAt",
          d.parsed_json as "parsedJson"
        from documents d
        left join regulation_embeddings.documents r
          on r.tenant_id = d.tenant_id
         and r.source_document_id = d.id
        where r.id is null
        order by d.uploaded_at asc
      `
    });

    if (!documents.length) {
      console.log('✅ No documents require backfill.');
      return;
    }

    let ingested = 0;
    let skipped = 0;
    for (const doc of documents) {
      const { content, reason } = await resolveDocumentContent(doc);
      if (!content) {
        skipped += 1;
        console.warn(`⚠️  Skipping document ${doc.id} (${doc.filename}): ${reason}`);
        continue;
      }
      try {
        await searchService.ingestDocument({
          tenantId: doc.tenantId,
          sourceKey: `document:${doc.id}`,
          title: doc.filename,
          description: 'Backfilled from documents table',
          content,
          sourceDocumentId: doc.id,
          sourceUrl: doc.storageUrl,
          sourceType: 'DOCUMENT',
          metadata: {
            bytes: doc.bytes,
            mime: doc.mime,
            sha256: doc.sha256,
            ingest: 'rag-backfill-script'
          }
        });
        ingested += 1;
        console.log(`✅ Indexed ${doc.filename} (${doc.id})`);
      } catch (error) {
        skipped += 1;
        console.error(`❌ Failed to ingest document ${doc.id}`, error);
      }
    }

    console.log(`🏁 Backfill complete → ${ingested} ingested, ${skipped} skipped.`);
  } finally {
    await client.query(`select set_config('app.bypass_rls', 'off', false)`).catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Document backfill failed', error);
  process.exitCode = 1;
});

async function resolveDocumentContent(document) {
  if (document.parsedJson) {
    const serialized = JSON.stringify(document.parsedJson, null, 2);
    if (exceedsLimit(serialized)) {
      return { reason: 'parsed_json exceeds ingestion size limit' };
    }
    return { content: serialized };
  }

  if (!isTextLikeMime(document.mime)) {
    return { reason: `mime ${document.mime} is not text-based` };
  }

  const localPath = resolveLocalPath(document);
  if (localPath) {
    try {
      const buffer = await readFile(localPath);
      if (buffer.byteLength > MAX_BYTES) {
        return { reason: 'file exceeds ingestion size limit' };
      }
      return { content: buffer.toString('utf8') };
    } catch (error) {
      console.warn(`⚠️  Unable to read ${localPath}: ${error.message}`);
    }
  }

  if (document.storageUrl?.startsWith('http')) {
    try {
      const response = await fetch(document.storageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      if (exceedsLimit(text)) {
        return { reason: 'remote payload exceeds ingestion size limit' };
      }
      return { content: text };
    } catch (error) {
      return { reason: `fetch failed (${error.message})` };
    }
  }

  return { reason: 'no readable storage reference' };
}

function resolveLocalPath(document) {
  if (document.storageBucket && document.storageKey) {
    return path.join(DOCUMENTS_ROOT, document.storageBucket, document.storageKey);
  }
  if (document.storageUrl?.startsWith('file://')) {
    return fileURLToPath(document.storageUrl);
  }
  if (document.storageUrl?.startsWith('/')) {
    return document.storageUrl;
  }
  return null;
}

function exceedsLimit(text) {
  return Buffer.byteLength(text, 'utf8') > MAX_BYTES;
}

function isTextLikeMime(mime = '') {
  const lower = mime.toLowerCase();
  return TEXT_MIME_PREFIXES.some((prefix) => lower.startsWith(prefix)) || TEXT_MIME_TYPES.has(lower);
}
