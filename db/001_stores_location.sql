-- 0001: stores and location (PRD §8.1 LOC-1…6, §12 "Existing").
-- Applied unchanged as migration 0001 by scripts/migrate.ts.
-- Coarse location only: user-supplied points are rounded to 3 dp (~110 m) before storage.

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- Chains (Checkers, Shoprite, Pick n Pay, SPAR, Woolworths, Boxer, Usave, ...)
create table retailers (
  id text primary key,                         -- 'checkers'
  name text not null,                          -- 'Checkers'
  loyalty_program_id text null,                -- 'xtra_savings'
  loyalty_program_name text null,              -- 'Xtra Savings'
  osm_brand_wikidata text null,                -- e.g. 'Q5089126' for matching OSM brand:wikidata
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Physical stores
create table branches (
  id bigserial primary key,
  retailer_id text not null references retailers(id),
  name text not null,                          -- 'Checkers Bluewater Bay'
  osm_id text null unique,                     -- 'node/123', 'way/456'
  address text null,
  suburb text null,
  city text null,
  province text null,                          -- 'EC', 'WC', ...
  geom geography(Point, 4326) not null,
  verified boolean not null default false,     -- manually checked (pilot areas)
  active boolean not null default true,
  source text not null default 'osm' check (source in ('osm', 'report', 'manual', 'test')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index branches_geom_gist on branches using gist (geom);
create index branches_retailer_idx on branches (retailer_id);

-- Searchable places for location search and reverse labels (no paid API, LOC-1/LOC-2)
create table places (
  id bigserial primary key,
  name text not null,                          -- 'Bluewater Bay'
  name_norm text not null,                     -- lower(unaccent-ish) for search
  kind text not null check (kind in ('city', 'town', 'suburb', 'neighbourhood', 'township', 'section', 'village', 'street')),
  parent_name text null,                       -- 'Gqeberha'
  province text null,
  geom geography(Point, 4326) not null,
  osm_id text null unique,
  source text not null default 'osm' check (source in ('osm', 'seed', 'manual')),
  rank int not null default 0,                 -- higher = preferred in search
  created_at timestamptz not null default now()
);
create index places_geom_gist on places using gist (geom);
create index places_name_trgm on places using gin (name_norm gin_trgm_ops);

-- Signed-in users' shops (anonymous households keep shops locally + on households; synced on sign-up, LOC-4)
create table user_shops (
  user_id uuid primary key,
  main_branch_id bigint not null references branches(id),
  top_up_branch_id bigint null references branches(id),
  loyalty text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table user_saved_places (
  id bigserial primary key,
  user_id uuid not null,
  label text not null,
  lat numeric(6, 3) not null,                  -- 3 dp only
  lng numeric(6, 3) not null,
  created_at timestamptz not null default now()
);

-- "My shop isn't listed" / closed / wrong location (LOC-5, ADM-5)
create table branch_reports (
  id bigserial primary key,
  kind text not null default 'missing' check (kind in ('missing', 'closed', 'wrong_location')),
  retailer_id text null references retailers(id),
  retailer_text text null,
  branch_id bigint null references branches(id),
  note text null,
  geom geography(Point, 4326) null,            -- coarse point (3 dp)
  household_id uuid null,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  resolved_branch_id bigint null references branches(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);
create index branch_reports_status_idx on branch_reports (status, created_at);

-- All active branches within radius_m of a point, nearest first, with a flag for the
-- nearest branch of each chain (LOC-3). The app widens the radius 5 → 10 → 25 → 50 km.
create or replace function nearby_branches(p_lat double precision, p_lng double precision, p_radius_m double precision, p_limit int default 50)
returns table (
  branch_id bigint,
  retailer_id text,
  retailer_name text,
  branch_name text,
  suburb text,
  city text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  nearest_of_chain boolean,
  verified boolean
)
language sql stable as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g),
  hits as (
    select b.id, b.retailer_id, r.name as retailer_name, b.name, b.suburb, b.city,
           st_y(b.geom::geometry) as lat, st_x(b.geom::geometry) as lng,
           st_distance(b.geom, pt.g) as distance_m, b.verified
    from branches b
    join retailers r on r.id = b.retailer_id and r.active
    cross join pt
    where b.active and st_dwithin(b.geom, pt.g, p_radius_m)
  )
  select id, retailer_id, retailer_name, name, suburb, city, lat, lng, distance_m,
         row_number() over (partition by retailer_id order by distance_m) = 1 as nearest_of_chain,
         verified
  from hits
  order by distance_m
  limit p_limit
$$;
