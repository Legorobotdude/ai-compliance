-- 002_views_and_functions.sql
-- Adds helper SQL artifacts consumed by repositories: create_bom stored procedure,
-- compliance/dashboard views, and the regulation search helper.

create or replace function create_bom(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  v_bom jsonb;
  v_tenant uuid;
  v_product uuid;
  v_uploaded_by uuid;
  v_source_doc uuid;
  v_external_id text;
  v_bom_id uuid;
  v_assemblies jsonb := coalesce(payload -> 'assemblies', '[]'::jsonb);
  v_components jsonb := coalesce(payload -> 'components', '[]'::jsonb);
begin
  if payload is null then
    raise exception 'create_bom payload cannot be null';
  end if;
  v_bom := payload -> 'bom';
  if v_bom is null then
    raise exception 'create_bom payload missing bom object';
  end if;

  v_tenant := (v_bom ->> 'tenantId')::uuid;
  v_product := (v_bom ->> 'productId')::uuid;
  v_uploaded_by := nullif(v_bom ->> 'uploadedBy', '')::uuid;
  v_source_doc := nullif(v_bom ->> 'sourceDocId', '')::uuid;
  v_external_id := nullif(v_bom ->> 'bomExternalId', '');
  if v_external_id is null then
    v_external_id := 'BOM-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  insert into boms (tenant_id, product_id, bom_external_id, uploaded_by, source_doc_id)
  values (v_tenant, v_product, v_external_id, v_uploaded_by, v_source_doc)
  returning id into v_bom_id;

  insert into bom_subassemblies (tenant_id, bom_id, assembly_id, name, parent_assembly_id)
  select
    coalesce(nullif(asm ->> 'tenantId', '')::uuid, v_tenant) as tenant_id,
    v_bom_id,
    asm ->> 'assemblyId',
    asm ->> 'name',
    nullif(asm ->> 'parentAssemblyId', '')
  from jsonb_array_elements(v_assemblies) as asm
  where asm ? 'assemblyId';

  insert into bom_components (tenant_id, bom_id, assembly_id, part_number, material, weight_g, weight_mg, normalized_weight_mg)
  select
    coalesce(nullif(comp ->> 'tenantId', '')::uuid, v_tenant) as tenant_id,
    v_bom_id,
    comp ->> 'assemblyId',
    comp ->> 'partNumber',
    nullif(comp ->> 'material', ''),
    nullif(comp ->> 'weightG', '')::numeric,
    nullif(comp ->> 'weightMg', '')::numeric,
    nullif(comp ->> 'normalizedWeightMg', '')::integer
  from jsonb_array_elements(v_components) as comp
  where comp ? 'partNumber';

  return v_bom_id;
end;
$$;

create or replace view v_compliance_status as
with supplier_choice as (
  select
    cs.*,
    row_number() over (
      partition by cs.tenant_id, cs.part_number
      order by
        case cs.sourcing_type when 'PRIMARY' then 1 when 'SECONDARY' then 2 else 3 end,
        cs.created_at desc
    ) as rn
  from component_suppliers cs
), latest_certificates as (
  select *
  from (
    select
      c.*,
      row_number() over (
        partition by c.tenant_id, c.part_number
        order by coalesce(c.valid_until, (c.created_at)::date) desc,
                 c.created_at desc
      ) as rn
    from certificates c
  ) ranked
  where rn = 1
), finding_aggregates as (
  select
    cf.certificate_id,
    jsonb_agg(
      jsonb_build_object(
        'substance', cf.substance_name,
        'ppm', cf.concentration_ppm,
        'thresholdPpm', lc.threshold_ppm
      ) order by cf.substance_name
    ) as findings,
    bool_or(
      cf.concentration_ppm is not null
      and lc.threshold_ppm is not null
      and cf.concentration_ppm > lc.threshold_ppm
    ) as has_over_limit
  from certificate_findings cf
  join latest_certificates lc on lc.id = cf.certificate_id
  group by cf.certificate_id
)
select
  bc.tenant_id,
  bc.bom_id,
  bc.assembly_id,
  bc.part_number,
  sc.supplier_id,
  case
    when lc.id is null then 'MISSING'
    when lc.valid_until is not null and lc.valid_until < current_date then 'EXPIRED'
    when coalesce(fa.has_over_limit, false) then 'OVER_LIMIT'
    else 'COMPLIANT'
  end as status,
  lc.valid_until,
  coalesce(fa.findings, '[]'::jsonb) as findings
from bom_components bc
left join supplier_choice sc
  on sc.tenant_id = bc.tenant_id
 and sc.part_number = bc.part_number
 and sc.rn = 1
left join latest_certificates lc
  on lc.tenant_id = bc.tenant_id
 and lc.part_number = bc.part_number
left join finding_aggregates fa on fa.certificate_id = lc.id;

create or replace view v_blocked_supplier_parts as
with supplier_choice as (
  select
    cs.*,
    row_number() over (
      partition by cs.tenant_id, cs.part_number
      order by
        case cs.sourcing_type when 'PRIMARY' then 1 when 'SECONDARY' then 2 else 3 end,
        cs.created_at desc
    ) as rn
  from component_suppliers cs
), issue_rows as (
  select
    ii.tenant_id,
    sc.supplier_id,
    ii.bom_id,
    bc.part_number,
    bc.assembly_id,
    case
      when ii.code in ('VALUE_MISSING', 'UNIT_MISSING') then 'VALUE_MISSING'
      when ii.code = 'SUPPLIER_MISSING' then 'MISSING'
      else ii.code::text
    end as reason
  from ingestion_issues ii
  join bom_components bc
    on bc.tenant_id = ii.tenant_id
   and bc.bom_id = ii.bom_id
   and bc.part_number = ii.part_number
  left join supplier_choice sc
    on sc.tenant_id = bc.tenant_id
   and sc.part_number = bc.part_number
   and sc.rn = 1
  where ii.status = 'OPEN'
)
select tenant_id, supplier_id, bom_id, part_number, assembly_id, reason
from (
  select
    v.tenant_id,
    v.supplier_id,
    v.bom_id,
    v.part_number,
    v.assembly_id,
    case
      when v.status = 'OVER_LIMIT' then 'OVER_LIMIT'
      when v.status = 'EXPIRED' then 'EXPIRED'
      else 'MISSING'
    end as reason
  from v_compliance_status v
  where v.status in ('MISSING', 'EXPIRED', 'OVER_LIMIT')
  union all
  select * from issue_rows
) blocked;

create or replace function regulation_embeddings.search(p_tenant_id uuid, p_query text, p_top_k integer default 5)
returns table (id uuid, score double precision, content text, source_url text)
language plpgsql
stable
as $$
declare
  v_limit integer := greatest(1, coalesce(p_top_k, 5));
  v_query text := coalesce(trim(p_query), '');
begin
  if v_query = '' then
    return query
    select c.id, 0::double precision as score, c.content, c.source_url
    from regulation_embeddings.chunks c
    where c.tenant_id = p_tenant_id
    order by c.created_at desc
    limit v_limit;
  end if;

  return query
  select c.id,
         ts_rank_cd(c.content_tsv, plainto_tsquery('english', v_query)) as score,
         c.content,
         c.source_url
  from regulation_embeddings.chunks c
  where c.tenant_id = p_tenant_id
    and c.content_tsv @@ plainto_tsquery('english', v_query)
  order by score desc
  limit v_limit;
end;
$$;
