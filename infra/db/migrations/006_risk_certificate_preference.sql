-- 006_risk_certificate_preference.sql
-- Ensure v_compliance_status prioritizes certificates that include threshold data
-- so RiskImpactService (Architecture.md §6) can detect over-limit parts.

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
        order by
          case when c.threshold_ppm is not null then 0 else 1 end,
          coalesce(c.valid_until, (c.created_at)::date) desc,
          c.created_at desc
      ) as rn
    from certificates c
  ) ranked
  where rn = 1
), global_limits as (
  select lower(substance) as substance, min(limit_ppm) as limit_ppm
  from regulation_limits
  group by lower(substance)
), finding_aggregates as (
  select
    cf.certificate_id,
    jsonb_agg(
      jsonb_build_object(
        'substance', cf.substance_name,
        'ppm', cf.concentration_ppm,
        'thresholdPpm', coalesce(lc.threshold_ppm, gl.limit_ppm)
      ) order by cf.substance_name
    ) as findings,
    bool_or(
      cf.concentration_ppm is not null
      and coalesce(lc.threshold_ppm, gl.limit_ppm) is not null
      and cf.concentration_ppm > coalesce(lc.threshold_ppm, gl.limit_ppm)
    ) as has_over_limit
  from certificate_findings cf
  join latest_certificates lc on lc.id = cf.certificate_id
  left join global_limits gl on lower(gl.substance) = lower(cf.substance_name)
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
