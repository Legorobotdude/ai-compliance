-- 004_document_lifecycle.sql
-- Adds document lifecycle metadata to support Architecture.md §1 requirements
-- (upload state machine, virus scanning, retention policies, storage references).

create type document_upload_status as enum ('PENDING_UPLOAD', 'UPLOADED', 'VALIDATED', 'READY', 'FAILED');
create type document_scan_status as enum ('NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'CLEAN', 'INFECTED', 'ERROR');

alter table documents
  add column storage_bucket text,
  add column storage_key text,
  add column storage_class text,
  add column kms_key_id text,
  add column upload_status document_upload_status not null default 'PENDING_UPLOAD',
  add column scan_status document_scan_status not null default 'NOT_REQUIRED',
  add column scan_requested_at timestamptz,
  add column scan_completed_at timestamptz,
  add column upload_completed_at timestamptz,
  add column retention_expires_at timestamptz,
  add column deleted_at timestamptz;

update documents
set
  upload_status = 'READY',
  scan_status = 'NOT_REQUIRED',
  upload_completed_at = coalesce(upload_completed_at, uploaded_at)
where upload_status = 'PENDING_UPLOAD';

create index if not exists idx_documents_tenant_upload_status on documents (tenant_id, upload_status);
create index if not exists idx_documents_tenant_scan_status on documents (tenant_id, scan_status);
create index if not exists idx_documents_retention on documents (retention_expires_at)
  where retention_expires_at is not null;
