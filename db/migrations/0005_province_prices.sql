-- 0005: province-scoped prices. A price observation now has one of three scopes:
--   branch_id set            → that branch only (receipts, branch CSV rows)
--   province set             → every branch of that retailer in the province (regional leaflets)
--   neither                  → national, every branch of that retailer
-- Mirrored by db/schema/core.ts. lib/prices/snapshot.ts resolves a branch over all three with the §10.1 order.

alter table price_observations add column province text null
  check (province is null or province in ('EC', 'WC', 'NC', 'FS', 'GP', 'KZN', 'NW', 'LP', 'MP'));
alter table price_observations add constraint price_obs_one_scope check (branch_id is null or province is null);
create index price_obs_province on price_observations (product_id, province, observed_at desc) where province is not null;

-- The province a leaflet batch applies to (null = national); copied onto its observations when published.
alter table ingest_batches add column province text null
  check (province is null or province in ('EC', 'WC', 'NC', 'FS', 'GP', 'KZN', 'NW', 'LP', 'MP'));

-- Same §10.1 rule as 0002, now resolved separately per (product, branch, province) scope.
drop function if exists refresh_current_prices();
drop materialized view if exists current_prices;
create materialized view current_prices as
with scored as (
  select o.id, o.product_id, o.branch_id, o.province, o.retailer_id, p.ingredient_id, p.pack_qty, p.pack_unit,
         o.price_cents, o.member_price_cents, o.special_price_cents, o.special_ends_on, o.source, o.observed_at,
         (o.observed_at >= now() - interval '7 days') as is_fresh,
         case o.source when 'receipt' then 4 when 'leaflet' then 3 when 'catalogue' then 2 else 1 end as trust
  from price_observations o
  join products p on p.id = o.product_id and p.active
  where o.observed_at >= now() - interval '21 days'
),
ranked as (
  select s.*, row_number() over (
           partition by s.product_id, s.branch_id, s.province
           order by s.is_fresh desc, (case when s.is_fresh then s.trust else 0 end) desc, s.observed_at desc, s.id desc
         ) as rn
  from scored s
)
select id as observation_id, product_id, branch_id, province, retailer_id, ingredient_id, pack_qty, pack_unit, price_cents,
       member_price_cents, special_price_cents, special_ends_on, source, observed_at, is_fresh, trust,
       now() as refreshed_at
from ranked where rn = 1;
create unique index current_prices_key on current_prices (product_id, coalesce(branch_id, 0), coalesce(province, ''));
create index current_prices_ingredient on current_prices (ingredient_id, retailer_id);

create or replace function refresh_current_prices() returns void language sql as $$
  refresh materialized view current_prices;
$$;
