-- 007_pfas_limit_fix.sql
-- Ensure the PFAS regulation exposes a PFAS aggregate limit so /impact/predict
-- aligns with the Architecture.md §5 sample data and impact smoke tests.

with target as (
  select
    r.id as regulation_id,
    coalesce(
      (
        select limit_ppm
        from regulation_limits
        where lower(substance) = 'pfas'
        order by updated_at desc
        limit 1
      ),
      50
    ) as limit_ppm
  from regulations r
  where r.code = 'PFAS'
)
insert into regulation_limits (regulation_id, substance, limit_ppm)
select regulation_id, 'PFAS', limit_ppm
from target
on conflict (regulation_id, substance) do update
set limit_ppm = excluded.limit_ppm;

