Current State
    services/document-service.ts:1, modules/file-document/src/repositories/document-repository.ts:1).
  - Gateway/API validation still expects callers to supply the final storageUrl/hash, so uploads are entirely client-managed and the backend cannot guarantee bucket, key naming, or virus-scan status (modules/gateway/src/validation/schemas.ts:24, apps/api/src/main.ts:197).
  - CORA already reads storage_url values directly (HTTP/S3/local) and updates documents.parsed_json, so whatever we build must continue to serve the FastAPI sidecar’s storage client + text extractor (apps/cora/src/cora/storage.py:1, apps/cora/src/cora/services.py:60).
  - Seed data and lab tooling assume specific deterministic document IDs stored as s3://sample/..., taking advantage of the sidecar’s “sample bucket” fallback, but there’s no real S3/MinIO infrastructure or helper scripts to stage documents for local testing (libs/db/scripts/seed-
  Implementation Plan

   1. Schema & auditing: extend documents per Architecture.md §1 with status columns (upload_status, virus_scan_status, retention_expires_at, optional kms_key_id, bucket, object_key, storage_class, deleted_at) plus triggers/audit-log helpers so we can track lifecycle transitions;
         Wire configuration through @certivo/lib-config so API, workers, and scripts all read the same bucket/key prefixes, encryption requirements, and upload expiry.
      1. Upload workflow redesign: replace the current “client posts storageUrl” flow with a two-step presign API:
      2. POST /documents/uploads creates a DB row in PENDING_UPLOAD, generates a deterministic object key (tenantId/uuid/filename), signs a PUT URL (or POST form) with optional SSE/KMS headers, and returns {documentId, uploadUrl, headers, expiresAt} plus a callback topic for the
         virus scanner.
      3. POST /documents/:id/complete (or PATCH) confirms the byte size/hash that the client observed; server re-heads the object, validates SHA-256, transitions to QUARANTINE and schedules an AV scan through @certivo/jobs-workflows.
         Update the controller/service (modules/file-document/src/...) and gateway schema accordingly, then adjust scripts/lab-smoke/Next.js lab forms to call the new handshake.
     done 4. Download & CORA integration: add service functions to mint short-lived GET URLs for CORA and other consumers, optionally embedding response-content-disposition. For synchronous fetches (like worker-side parsing), expose a direct storage:// URI so the Python sidecar keeps
         working. Provide repository helpers for parsed_json updates so the Compliance service (or workers) can stash AI outputs without bypassing the module.
      4. Security, scanning, retention: define a FileScanService that publishes scan jobs to the workflow module (Temporal/BullMQ) and records the result/status; enforce tenant-level encryption by storing kms_key_alias per tenant (could live in a new tenant_settings table) and
         attaching the right SSE fields during presign. Add retention cron logic (worker + SQL query) to purge/soft-delete documents past their policy, logging to audit_logs.
      5. Testing & observability: add unit tests for the storage adapter (mocking AWS v3), service-level tests for the upload lifecycle, and an end-to-end smoke (e.g., extend scripts/lab-smoke.mjs) that uploads to MinIO, hits /ai/parse-document, and verifies parsed_json persists.
         Emit metrics (upload counts, scan failures) via the API’s Prometheus registry.
