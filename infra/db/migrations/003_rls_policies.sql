-- 003_rls_policies.sql
-- Enforce tenant isolation via PostgreSQL RLS aligned with Architecture.md §7.

create schema if not exists app_private;

create or replace function app_private.current_tenant()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_tenant', true), '')::uuid
$$;

create or replace function app_private.bypass_rls()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.bypass_rls', true), ''), 'off') = 'on'
$$;

create or replace function app_private.roles()
returns text[]
language sql
stable
as $$
  select case
    when current_setting('app.current_roles', true) = '' then '{}'
    else string_to_array(current_setting('app.current_roles', true), ',')
  end::text[]
$$;

-- Helper macro-like definition
do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'users','api_keys','documents','products','boms','bom_subassemblies','bom_components',
        'suppliers','component_suppliers','supplier_requests','certificates','ingestion_issues','workflow_events',
        'audit_logs','llm_calls','impact_scenarios'
      )
  loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format($policy$
      create policy %I_tenant_isolation on %I
        using (app_private.bypass_rls() or tenant_id = app_private.current_tenant())
        with check (app_private.bypass_rls() or tenant_id = app_private.current_tenant())
    $policy$, table_name, table_name);
  end loop;
end $$;

-- tables whose tenant_id column name differs (tenants table uses id for scoping)
alter table tenants enable row level security;
alter table tenants force row level security;
drop policy if exists tenants_tenant_isolation on tenants;
create policy tenants_tenant_isolation on tenants
  using (app_private.bypass_rls() or id = app_private.current_tenant())
  with check (app_private.bypass_rls() or id = app_private.current_tenant());

-- Supplier contacts inherit tenant from suppliers
alter table supplier_contacts enable row level security;
alter table supplier_contacts force row level security;
create policy supplier_contacts_isolation on supplier_contacts
  using (
    app_private.bypass_rls()
    or exists (
      select 1
      from suppliers s
      where s.id = supplier_id
        and s.tenant_id = app_private.current_tenant()
    )
  )
  with check (
    app_private.bypass_rls()
    or exists (
      select 1
      from suppliers s
      where s.id = supplier_contacts.supplier_id
        and s.tenant_id = app_private.current_tenant()
    )
  );

-- Certificate findings inherit tenant via certificates
alter table certificate_findings enable row level security;
alter table certificate_findings force row level security;
create policy certificate_findings_isolation on certificate_findings
  using (
    app_private.bypass_rls()
    or exists (
      select 1
      from certificates c
      where c.id = certificate_id
        and c.tenant_id = app_private.current_tenant()
    )
  )
  with check (
    app_private.bypass_rls()
    or exists (
      select 1
      from certificates c
      where c.id = certificate_findings.certificate_id
        and c.tenant_id = app_private.current_tenant()
    )
  );

-- Regulation embeddings schema is multi-tenant.
alter table regulation_embeddings.chunks enable row level security;
alter table regulation_embeddings.chunks force row level security;
create policy reg_embedding_isolation on regulation_embeddings.chunks
  using (app_private.bypass_rls() or tenant_id = app_private.current_tenant())
  with check (app_private.bypass_rls() or tenant_id = app_private.current_tenant());
