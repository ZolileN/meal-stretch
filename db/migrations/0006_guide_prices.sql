-- 0006: guide prices. Prices looked up online (web search) for the MVP so every ingredient has a price.
--   source 'guide': lowest trust, usable for 90 days (others: 21), always flagged "may have changed".
--   source_url: where a price was found (any source may fill it).
-- A branch without its own price for an ingredient may use a guide price found at another retailer;
-- lib/prices/snapshot.ts does that and the list says so. Order: §10.1 unchanged for real prices; guide prices
-- always rank after every non-guide price. Mirrored by db/schema/core.ts.

alter table price_observations drop constraint if exists price_observations_source_check;
alter table price_observations add constraint price_observations_source_check
  check (source in ('catalogue', 'leaflet', 'receipt', 'manual', 'guide'));
alter table price_observations add column source_url text null check (source_url is null or source_url ~ '^https?://');

drop function if exists refresh_current_prices();
drop materialized view if exists current_prices;
create materialized view current_prices as
with scored as (
  select o.id, o.product_id, o.branch_id, o.province, o.retailer_id, p.ingredient_id, p.pack_qty, p.pack_unit,
         o.price_cents, o.member_price_cents, o.special_price_cents, o.special_ends_on, o.source, o.source_url, o.observed_at,
         (o.source <> 'guide' and o.observed_at >= now() - interval '7 days') as is_fresh,
         case o.source when 'receipt' then 4 when 'leaflet' then 3 when 'catalogue' then 2 when 'manual' then 1 else 0 end as trust
  from price_observations o
  join products p on p.id = o.product_id and p.active
  where o.observed_at >= now() - interval '21 days'
     or (o.source = 'guide' and o.observed_at >= now() - interval '90 days')
),
ranked as (
  select s.*, row_number() over (
           partition by s.product_id, s.branch_id, s.province
           order by s.is_fresh desc, (case when s.is_fresh then s.trust else 0 end) desc, (s.source = 'guide') asc, s.observed_at desc, s.id desc
         ) as rn
  from scored s
)
select id as observation_id, product_id, branch_id, province, retailer_id, ingredient_id, pack_qty, pack_unit, price_cents,
       member_price_cents, special_price_cents, special_ends_on, source, source_url, observed_at, is_fresh, trust,
       now() as refreshed_at
from ranked where rn = 1;
create unique index current_prices_key on current_prices (product_id, coalesce(branch_id, 0), coalesce(province, ''));
create index current_prices_ingredient on current_prices (ingredient_id, retailer_id);

create or replace function refresh_current_prices() returns void language sql as $$
  refresh materialized view current_prices;
$$;
