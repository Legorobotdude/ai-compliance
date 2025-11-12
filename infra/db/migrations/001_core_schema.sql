-- 001_core_schema.sql
-- Bootstrap the multi-tenant data model outlined in Architecture.md §2.
-- Creates core tables, enums, helper triggers, and indexes so the Gateway/API can persist BOMs,
-- suppliers, certificates, audit data, and ingestion workflows.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists vector;

create schema if not exists regulation_embeddings;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create type user_role as enum ('VIEWER', 'ANALYST', 'ADMIN', 'SYSTEM');
create type request_status as enum ('PENDING', 'SENT', 'RESPONDED', 'ESCALATED', 'CLOSED');
create type certificate_type as enum ('ROHS', 'REACH', 'CUSTOM');
create type document_limit_source as enum ('DOC', 'REGULATION');
create type data_quality_flag as enum ('OK', 'UNIT_MISSING', 'VALUE_MISSING', 'OUTLIER');
create type ingestion_issue_code as enum ('SUPPLIER_MISSING', 'VALUE_MISSING', 'UNIT_MISSING', 'UPLOAD_ERROR', 'WEIGHT_MISSING');
create type ingestion_issue_status as enum ('OPEN', 'IN_PROGRESS', 'RESOLVED');
create type workflow_event_type as enum ('SUPPLIER_REQUEST', 'INGESTION', 'IMPACT', 'LLM', 'SYSTEM');
create type llm_agent as enum ('DOCUMENT_PARSE', 'SUPPLIER_EMAIL', 'RISK_SUMMARY');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tenants_updated_at before update on tenants for each row execute function set_updated_at();

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role user_role not null default 'VIEWER',
  oidc_sub text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email),
  unique (oidc_sub)
);
create trigger trg_users_updated_at before update on users for each row execute function set_updated_at();

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hashed_key text not null,
  scope text[] not null default array[]::text[],
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_api_keys_updated_at before update on api_keys for each row execute function set_updated_at();

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  filename text not null,
  mime text not null,
  bytes integer not null,
  storage_url text not null,
  sha256 text not null,
  uploaded_at timestamptz not null default now(),
  parsed_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_documents_updated_at before update on documents for each row execute function set_updated_at();

create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create trigger trg_products_updated_at before update on products for each row execute function set_updated_at();

create sequence if not exists bom_external_seq;

create table boms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  bom_external_id text not null default ('BOM-' || substr(gen_random_uuid()::text, 1, 8)),
  uploaded_by uuid references users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  source_doc_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bom_external_id)
);
create trigger trg_boms_updated_at before update on boms for each row execute function set_updated_at();

create table bom_subassemblies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  bom_id uuid not null references boms(id) on delete cascade,
  assembly_id text not null,
  name text not null,
  parent_assembly_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bom_id, assembly_id)
);
create trigger trg_bom_subassemblies_updated_at before update on bom_subassemblies for each row execute function set_updated_at();

create table bom_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  bom_id uuid not null references boms(id) on delete cascade,
  assembly_id text not null,
  part_number text not null,
  material text,
  weight_g numeric,
  weight_mg numeric,
  normalized_weight_mg integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, bom_id, part_number),
  foreign key (tenant_id, bom_id, assembly_id) references bom_subassemblies(tenant_id, bom_id, assembly_id)
);
create trigger trg_bom_components_updated_at before update on bom_components for each row execute function set_updated_at();

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  country text not null,
  language text not null,
  compliance_rate numeric(5,4) not null default 0,
  response_avg_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_suppliers_updated_at before update on suppliers for each row execute function set_updated_at();

create table supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, email)
);
create trigger trg_supplier_contacts_updated_at before update on supplier_contacts for each row execute function set_updated_at();

create table component_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  part_number text not null,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  sourcing_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, part_number, supplier_id),
  check (sourcing_type is null or sourcing_type in ('PRIMARY', 'SECONDARY', 'CONTRACT'))
);
create trigger trg_component_suppliers_updated_at before update on component_suppliers for each row execute function set_updated_at();

create table supplier_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  bom_id uuid not null references boms(id) on delete cascade,
  requested_by uuid references users(id) on delete set null,
  status request_status not null default 'PENDING',
  sent_at timestamptz,
  due_at timestamptz,
  last_reminder_at timestamptz,
  response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_supplier_requests_updated_at before update on supplier_requests for each row execute function set_updated_at();

create table certificates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  part_number text not null,
  type certificate_type not null,
  declaration_date date,
  valid_until date,
  threshold_ppm integer,
  document_limit_source document_limit_source,
  source_doc_id uuid references documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_certificates_updated_at before update on certificates for each row execute function set_updated_at();

create table certificate_findings (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references certificates(id) on delete cascade,
  substance_name text not null,
  concentration_value numeric,
  concentration_unit text,
  concentration_ppm numeric,
  concentration_raw text,
  data_quality data_quality_flag not null default 'OK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (concentration_unit is null or concentration_unit in ('%', 'ppm', 'mg/kg'))
);
create trigger trg_certificate_findings_updated_at before update on certificate_findings for each row execute function set_updated_at();

create table regulations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  region text not null,
  version text not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version)
);
create trigger trg_regulations_updated_at before update on regulations for each row execute function set_updated_at();

create table regulation_limits (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references regulations(id) on delete cascade,
  substance text not null,
  limit_ppm integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (regulation_id, substance)
);
create trigger trg_regulation_limits_updated_at before update on regulation_limits for each row execute function set_updated_at();

create table ingestion_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  bom_id uuid references boms(id) on delete cascade,
  part_number text,
  code ingestion_issue_code not null,
  message text not null,
  status ingestion_issue_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_ingestion_issues_updated_at before update on ingestion_issues for each row execute function set_updated_at();

create table workflow_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow workflow_event_type not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_workflow_events_updated_at before update on workflow_events for each row execute function set_updated_at();

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  target text not null,
  payload_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_audit_logs_updated_at before update on audit_logs for each row execute function set_updated_at();

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  agent llm_agent not null,
  prompt_hash text not null,
  input_json jsonb not null,
  output_json jsonb,
  model text not null,
  latency_ms integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_llm_calls_updated_at before update on llm_calls for each row execute function set_updated_at();

create table impact_scenarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  regulation_code text not null,
  payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_impact_scenarios_updated_at before update on impact_scenarios for each row execute function set_updated_at();

create table regulation_embeddings.chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  regulation_id uuid references regulations(id) on delete set null,
  content text not null,
  source_url text,
  embedding vector(1536),
  content_tsv tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_regulation_embeddings_chunks_updated_at before update on regulation_embeddings.chunks for each row execute function set_updated_at();
create index if not exists idx_regulation_embeddings_chunks_tsv on regulation_embeddings.chunks using gin (content_tsv);

-- Recommended indexes from Architecture.md §2
create index if not exists idx_bom_components_tenant_bom on bom_components (tenant_id, bom_id);
create index if not exists idx_bom_components_part on bom_components (tenant_id, part_number);
create index if not exists idx_certificate_findings_substance on certificate_findings (substance_name);
create index if not exists idx_certificates_part_valid on certificates (part_number, valid_until desc);
create index if not exists idx_component_suppliers_part on component_suppliers (tenant_id, part_number);
create index if not exists idx_supplier_requests_status_due on supplier_requests (supplier_id, status, due_at);
create index if not exists idx_ingestion_issues_status on ingestion_issues (tenant_id, status);
create index if not exists idx_certificates_supplier on certificates (tenant_id, supplier_id);
create index if not exists idx_llm_calls_agent on llm_calls (agent, tenant_id);
