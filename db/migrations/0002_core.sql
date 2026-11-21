-- 0002: core data model (PRD §12). Households, catalogue, prices, recipes, plans, receipts,
-- savings, notifications, analytics. Mirrored by db/schema/core.ts.

-- ── Users & households ─────────────────────────────────────────────────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  name text,
  email_verified timestamptz,
  image text,
  created_at timestamptz not null default now()
);

create table households (
  id uuid primary key default gen_random_uuid(),
  device_id uuid unique,                          -- httpOnly cookie for anonymous use (ONB-1)
  user_id uuid null references users(id) on delete set null,
  light int not null default 0 check (light between 0 and 12),
  average int not null default 1 check (average between 0 and 12),
  big int not null default 0 check (big between 0 and 12),
  loyalty text[] not null default '{}',
  exclusions text[] not null default '{}',
  never_swap_proteins text[] not null default '{}',
  payday_dom int null check (payday_dom between 1 and 31),
  language text not null default 'en' check (language in ('en', 'xh', 'af')),
  -- shops (LOC-4; also mirrored to user_shops for signed-in users)
  main_branch_id bigint null references branches(id),
  top_up_branch_id bigint null references branches(id),
  -- consent + notification preferences (POPIA, §14)
  receipt_consent_at timestamptz null,
  push_consent_at timestamptz null,
  notification_opt_out text[] not null default '{}',
  merged_into uuid null references households(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index households_user_idx on households (user_id);

create table household_members_access (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  primary key (household_id, user_id)
);

create table share_links (
  token text primary key,
  household_id uuid not null references households(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

-- ── Catalogue ──────────────────────────────────────────────────────────────────
create table ingredients (
  id text primary key,                            -- 'beef_mince'
  name text not null,
  unit text not null check (unit in ('g', 'ml', 'unit')),
  round_to int not null default 1 check (round_to > 0),
  perishable boolean not null default true,
  pantry_staple boolean not null default false,
  category text not null check (category in ('meat', 'fish', 'produce', 'dry', 'dairy', 'tinned', 'frozen', 'bakery', 'spices', 'sauces', 'oils'))
);

create table product_categories (
  id serial primary key,
  name text not null unique,
  aisle_order int not null
);

create table products (
  id bigserial primary key,
  retailer_id text not null references retailers(id),
  ingredient_id text null references ingredients(id),
  name text not null,
  brand text null,
  pack_qty int not null check (pack_qty > 0),
  pack_unit text not null check (pack_unit in ('g', 'ml', 'unit')),
  category_id int null references product_categories(id),
  is_house_brand boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index products_identity on products (retailer_id, lower(name), coalesce(lower(brand), ''), pack_qty, pack_unit);
create index products_ingredient_idx on products (ingredient_id, retailer_id);

create table product_aliases (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  alias_norm text not null,
  source text null,
  unique (product_id, alias_norm)
);
create index product_aliases_trgm on product_aliases using gin (alias_norm gin_trgm_ops);
create index product_aliases_norm on product_aliases (alias_norm);

-- ── Prices ─────────────────────────────────────────────────────────────────────
create table ingest_batches (
  id bigserial primary key,
  kind text not null check (kind in ('csv', 'leaflet', 'receipt', 'catalogue', 'manual')),
  retailer_id text null references retailers(id),
  uploaded_by uuid null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'review', 'published', 'rejected', 'failed')),
  raw jsonb null,
  created_at timestamptz not null default now()
);

create table price_observations (
  id bigserial primary key,
  product_id bigint not null references products(id),
  branch_id bigint null references branches(id),           -- null = chain-wide
  retailer_id text not null references retailers(id),
  price_cents int not null check (price_cents > 0),
  member_price_cents int null check (member_price_cents > 0),
  special_price_cents int null check (special_price_cents > 0),
  special_ends_on date null,
  source text not null check (source in ('catalogue', 'leaflet', 'receipt', 'manual')),
  observed_at timestamptz not null,
  ingest_batch_id bigint null references ingest_batches(id),
  household_id uuid null references households(id) on delete set null, -- receipt contributor; removed on delete (ACC-4)
  created_at timestamptz not null default now()
);
create index price_obs_product_branch on price_observations (product_id, branch_id, observed_at desc);
create index price_obs_retailer on price_observations (retailer_id, observed_at desc);

create table unmatched_items (
  id bigserial primary key,
  batch_id bigint null references ingest_batches(id),
  retailer_id text null references retailers(id),
  raw_name text not null,
  size_text text null,
  price_cents int null,
  resolved_product_id bigint null references products(id),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  created_at timestamptz not null default now()
);
create index unmatched_items_status on unmatched_items (status, created_at);

-- §10.1 resolution rule for (product, branch scope): the most trusted observation within 7 days;
-- else the most recent within 21 days; else none. Chain-wide rows (branch_id null) and branch rows are
-- resolved separately; lib/prices combines them per branch with the same ordering (the rule is a
-- max over a total order, so resolving the parts then the union gives the same answer).
create materialized view current_prices as
with scored as (
  select o.id, o.product_id, o.branch_id, o.retailer_id, p.ingredient_id, p.pack_qty, p.pack_unit,
         o.price_cents, o.member_price_cents, o.special_price_cents, o.special_ends_on, o.source, o.observed_at,
         (o.observed_at >= now() - interval '7 days') as is_fresh,
         case o.source when 'receipt' then 4 when 'leaflet' then 3 when 'catalogue' then 2 else 1 end as trust
  from price_observations o
  join products p on p.id = o.product_id and p.active
  where o.observed_at >= now() - interval '21 days'
),
ranked as (
  select s.*, row_number() over (
           partition by s.product_id, s.branch_id
           order by s.is_fresh desc, (case when s.is_fresh then s.trust else 0 end) desc, s.observed_at desc, s.id desc
         ) as rn
  from scored s
)
select id as observation_id, product_id, branch_id, retailer_id, ingredient_id, pack_qty, pack_unit, price_cents,
       member_price_cents, special_price_cents, special_ends_on, source, observed_at, is_fresh, trust,
       now() as refreshed_at
from ranked where rn = 1;
create unique index current_prices_key on current_prices (product_id, coalesce(branch_id, 0));
create index current_prices_ingredient on current_prices (ingredient_id, retailer_id);

create or replace function refresh_current_prices() returns void language sql as $$
  refresh materialized view current_prices;
$$;

-- ── Recipes ────────────────────────────────────────────────────────────────────
create table recipes (
  id text primary key,
  name text not null,
  description text null,
  cook_minutes int not null check (cook_minutes > 0),
  steps jsonb not null default '[]',
  tags text[] not null default '{}',
  image_url text null,
  published boolean not null default false,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table recipe_ingredients (
  recipe_id text not null references recipes(id) on delete cascade,
  ingredient_id text not null references ingredients(id),
  qty_per_serving int not null check (qty_per_serving > 0),
  optional boolean not null default false,
  primary key (recipe_id, ingredient_id)
);

create table recipe_translations (
  recipe_id text not null references recipes(id) on delete cascade,
  language text not null check (language in ('en', 'xh', 'af')),
  name text not null,
  steps jsonb not null default '[]',
  reviewed boolean not null default false,
  primary key (recipe_id, language)
);

-- ── Plans ──────────────────────────────────────────────────────────────────────
create table plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  start_date date not null,
  days int not null check (days between 1 and 14),
  request jsonb not null,
  result jsonb not null,
  engine_version text not null,
  seed int not null,
  price_as_of date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'shopped', 'archived')),
  paid_cents int not null,
  normal_cents int not null,
  savings_cents int not null,
  shopped_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_household_idx on plans (household_id, created_at desc);

create table list_ticks (
  plan_id uuid not null references plans(id) on delete cascade,
  line_key text not null,
  ticked boolean not null,
  updated_at timestamptz not null default now(),
  primary key (plan_id, line_key)
);

create table pantry_items (
  household_id uuid not null references households(id) on delete cascade,
  ingredient_id text not null references ingredients(id),
  qty int not null check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (household_id, ingredient_id)
);

-- ── Receipts & savings ─────────────────────────────────────────────────────────
create table receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  branch_id bigint null references branches(id),
  retailer_id text null references retailers(id),
  purchased_on date null,
  total_cents int null,
  image_url text null,
  extraction jsonb null,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'needs_review', 'verified', 'failed')),
  plan_id uuid null references plans(id) on delete set null,
  created_at timestamptz not null default now(),
  image_delete_after timestamptz null
);
create index receipts_household_idx on receipts (household_id, created_at desc);

create table receipt_lines (
  id bigserial primary key,
  receipt_id uuid not null references receipts(id) on delete cascade,
  raw_name text not null,
  product_id bigint null references products(id),
  qty numeric not null default 1,
  price_cents int not null,
  normal_price_cents int null,
  match_confidence real null
);

create table savings_events (
  id bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  kind text not null check (kind in ('plan_shopped', 'receipt_verified')),
  ref_id text not null,
  savings_cents int not null check (savings_cents >= 0),
  specials_cents int not null default 0,
  member_cents int not null default 0,
  pack_efficiency_cents int not null default 0,
  plan_id uuid null references plans(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);
create index savings_events_household on savings_events (household_id);

-- ── Notifications & analytics ──────────────────────────────────────────────────
create table push_subscriptions (
  id bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table notification_log (
  id bigserial primary key,
  household_id uuid not null references households(id) on delete cascade,
  kind text not null check (kind in ('specials_day', 'tonight', 'month_end', 'payday', 'receipt_nudge')),
  ref text null,
  sent_at timestamptz not null default now(),
  opened_at timestamptz null
);
create index notification_log_household on notification_log (household_id, sent_at desc);

create table events (
  id bigserial primary key,
  household_id uuid null,
  name text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_name_time on events (name, created_at);

-- Claude call cache + usage (cost control, §15)
create table llm_calls (
  id bigserial primary key,
  household_id uuid null,
  purpose text not null check (purpose in ('tweak', 'receipt', 'leaflet', 'recipe_draft', 'translation')),
  content_hash text not null,
  model text not null,
  input_tokens int null,
  output_tokens int null,
  latency_ms int null,
  cost_micro_usd int null,
  output jsonb null,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index llm_calls_hash on llm_calls (purpose, content_hash);
create index llm_calls_household_day on llm_calls (household_id, purpose, created_at);

-- Product categories with aisle order (LST-2)
insert into product_categories (name, aisle_order) values
  ('produce', 10), ('bakery', 20), ('meat', 30), ('fish', 35), ('dairy', 40), ('frozen', 50),
  ('tinned', 60), ('dry', 70), ('sauces', 80), ('spices', 90), ('oils', 95);
