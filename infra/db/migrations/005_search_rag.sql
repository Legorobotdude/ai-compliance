-- 005_search_rag.sql
-- Search/RAG module foundations per Architecture.md §1 and §4: adds document + chunk metadata,
-- query logging, updated scoring, and chat agent enum support so CORA can cite retrieved docs.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'rag_document_status') then
    create type rag_document_status as enum ('PENDING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'llm_agent'
      and e.enumlabel = 'CHAT'
  ) then
    alter type llm_agent add value 'CHAT';
  end if;
end$$;

create table if not exists regulation_embeddings.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_key text not null,
  source_document_id uuid references documents(id) on delete set null,
  regulation_id uuid references regulations(id) on delete set null,
  title text not null,
  description text,
  source_type text not null default 'DOCUMENT',
  language text,
  source_url text,
  checksum text not null,
  token_count integer not null default 0,
  chunk_count integer not null default 0,
  status rag_document_status not null default 'PENDING',
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_key)
);
drop trigger if exists trg_rag_documents_updated_at on regulation_embeddings.documents;
create trigger trg_rag_documents_updated_at
  before update on regulation_embeddings.documents
  for each row execute function set_updated_at();
create index if not exists idx_rag_documents_tenant_status
  on regulation_embeddings.documents (tenant_id, status, indexed_at desc nulls last);
create index if not exists idx_rag_documents_checksum
  on regulation_embeddings.documents (tenant_id, checksum);
create unique index if not exists idx_rag_documents_source_doc
  on regulation_embeddings.documents (tenant_id, source_document_id)
  where source_document_id is not null;

alter table regulation_embeddings.chunks
  add column if not exists document_id uuid references regulation_embeddings.documents(id) on delete cascade,
  add column if not exists chunk_index integer not null default 0,
  add column if not exists token_count integer,
  add column if not exists citation_label text;
create index if not exists idx_rag_chunks_document
  on regulation_embeddings.chunks (tenant_id, document_id, chunk_index);

create table if not exists regulation_embeddings.queries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  query text not null,
  top_k integer not null,
  filters jsonb not null default '{}'::jsonb,
  result_ids uuid[] not null default '{}'::uuid[],
  conversation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_rag_queries_tenant on regulation_embeddings.queries (tenant_id, created_at desc);

alter table regulation_embeddings.documents enable row level security;
alter table regulation_embeddings.documents force row level security;
drop policy if exists rag_documents_isolation on regulation_embeddings.documents;
create policy rag_documents_isolation on regulation_embeddings.documents
  using (app_private.bypass_rls() or tenant_id = app_private.current_tenant())
  with check (app_private.bypass_rls() or tenant_id = app_private.current_tenant());

alter table regulation_embeddings.queries enable row level security;
alter table regulation_embeddings.queries force row level security;
drop policy if exists rag_queries_isolation on regulation_embeddings.queries;
create policy rag_queries_isolation on regulation_embeddings.queries
  using (app_private.bypass_rls() or tenant_id = app_private.current_tenant())
  with check (app_private.bypass_rls() or tenant_id = app_private.current_tenant());

create or replace function regulation_embeddings.search(
  p_tenant_id uuid,
  p_query text,
  p_top_k integer default 5,
  p_embedding vector default null,
  p_filters jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  document_id uuid,
  document_title text,
  source_key text,
  source_type text,
  source_url text,
  score double precision,
  content text,
  chunk_index integer,
  metadata jsonb
)
language plpgsql
stable
as $$
declare
  v_limit integer := greatest(1, coalesce(p_top_k, 5));
  v_query text := coalesce(trim(p_query), '');
  v_tsquery tsquery := null;
  v_source_types text[] := null;
  v_document_ids uuid[] := null;
  v_source_keys text[] := null;
  v_min_score double precision := null;
begin
  if v_query <> '' then
    v_tsquery := plainto_tsquery('english', v_query);
  end if;

  if jsonb_typeof(p_filters -> 'sourceTypes') = 'array' then
    select array_agg(value::text)
      into v_source_types
      from jsonb_array_elements_text(p_filters -> 'sourceTypes') as value;
  end if;

  if jsonb_typeof(p_filters -> 'documentIds') = 'array' then
    select array_agg(value::uuid)
      into v_document_ids
      from jsonb_array_elements_text(p_filters -> 'documentIds') as value;
  end if;

  if jsonb_typeof(p_filters -> 'sourceKeys') = 'array' then
    select array_agg(value::text)
      into v_source_keys
      from jsonb_array_elements_text(p_filters -> 'sourceKeys') as value;
  end if;

  if (p_filters ->> 'minScore') is not null then
    v_min_score := (p_filters ->> 'minScore')::double precision;
  end if;

  return query
  with ranked as (
    select
      c.id,
      c.document_id,
      d.title,
      d.source_key,
      d.source_type,
      coalesce(c.source_url, d.source_url) as source_url,
      c.content,
      c.chunk_index,
      c.metadata,
      case
        when p_embedding is not null and c.embedding is not null
          then greatest(0, 1 - (c.embedding <=> p_embedding))
        else null
      end as vector_score,
      case
        when v_tsquery is not null then ts_rank_cd(c.content_tsv, v_tsquery)
        else null
      end as keyword_score,
      1.0 / (1 + c.chunk_index) as positional_boost
    from regulation_embeddings.chunks c
    join regulation_embeddings.documents d on d.id = c.document_id
    where d.tenant_id = p_tenant_id
      and d.status = 'READY'
      and (v_source_types is null or d.source_type = any(v_source_types))
      and (v_document_ids is null or d.id = any(v_document_ids))
      and (v_source_keys is null or d.source_key = any(v_source_keys))
  )
  select
    r.id,
    r.document_id,
    r.title,
    r.source_key,
    r.source_type,
    r.source_url,
    coalesce(r.vector_score, 0) * 0.7
      + coalesce(r.keyword_score, 0) * 0.25
      + r.positional_boost * 0.05 as score,
    r.content,
    r.chunk_index,
    r.metadata
  from ranked r
  where v_min_score is null
     or (coalesce(r.vector_score, 0) * 0.7
        + coalesce(r.keyword_score, 0) * 0.25
        + r.positional_boost * 0.05) >= v_min_score
  order by score desc, r.chunk_index asc
  limit v_limit;
end;
$$;
