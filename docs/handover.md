# Handover: budget-first supper planner (MVP, Phases 0–8)

Built 2026-11-21 from `PRD.md` and `docs/BUILD.md`. Status per step and phase gates: `docs/progress.md`. Every non-obvious choice: `docs/decisions.md`. Work only a person can do: the prioritised list at the end of this file (full list in `docs/human-todo.md`).

## What was built

| Area | What works | PRD |
|---|---|---|
| Location & stores | GPS (low accuracy, coarsened to 3 dp on the device) or search (local places first, Google Places only when gated in), nearby branches with 5 → 10 → 25 → 50 km widening, main + top-up shop, loyalty cards ("I have this card ✓"), "My shop isn't listed", persistent location bar, OSM import script | LOC-1…6, ONB-2 |
| Onboarding | Anonymous household by httpOnly device cookie; people (+ light/average/big), budget in whole rands, "until when" chips, quick avoid list; plan in ≤ 3 screens after location | ONB-1…6 |
| Planning engine | Pure TypeScript package: pack DP, portions, effective vs normal prices, savings split, variety constraints, pantry, unpriced handling, two-shop split, budget fallback with "fewer suppers" offer, swap/cheaper/remove; deterministic; p95 166 ms on 14 days × 200 recipes | §9, PLN-1…12 |
| Plan & list | P1 plan screen (total, per plate, savings R and %, specials used, budget status, price date, can't-price list), meal actions, Cook view with timers, shopping list grouped by store then aisle with source + date on every price, offline ticks (IndexedDB + sync), "Already have it", staples section, WhatsApp share, mark as shopped | §7.2–7.4, PLN-5…11, LST-1…6, SAV-3 |
| Savings & habit | Lifetime savings that only go up and never double count, steal of the week, PWA (manifest, icons, offline service worker, install prompt after first plan), web push with an explanation step, scheduler (quiet hours, 1/day cap, opt-outs, payday maths) | SAV-1…4, §14, §15 |
| Claude | One wrapper (`lib/claude.ts`): tool use + Zod, content-hash cache, cost/latency logs, daily caps, fixture mode, refusal fallback. Receipts → PII stripping → totals check → matching → branch-level receipt prices + verified savings; admin leaflet review/publish; unmatched queue; natural-language tweaks | RCP-1…6, ADM-2/3, PLN-13, §9.8, §10.4 |
| Accounts & admin | Auth.js (Google + email magic link), anonymous → account merge, revocable share links (read + tick), settings, JSON export and delete, admin (recipe editor + cost preview, leaflets, unmatched, branch reports, price health, pilot dashboard), all §16 events | ACC-1…4, ADM-1…6, I18N-1/3, §16 |

## Run it locally

Requirements: Node 22+, pnpm 10. Docker is optional: the local database is PGlite + PostGIS (WASM), which needs no install.

```bash
pnpm install
cp .env.example .env.local   # defaults point at the local database
pnpm dev                     # starts the local DB (fictional TEST branches + FICTIONAL prices) and Next on :3000
```

The first start takes about 20 s while PGlite loads PostGIS and seeds. The data lives in `.pglite/dev`; delete that folder to reset. Open http://localhost:3000, search "Somerset West" or "Bluewater Bay", pick a `TEST …` shop and plan.

| Command | What it does |
|---|---|
| `pnpm typecheck && pnpm lint` | TypeScript (app + engine) and ESLint |
| `pnpm test` | Unit + DB (in-memory PGlite + PostGIS) + engine tests |
| `pnpm test:e2e` | Playwright on a production build with a fresh local DB (`E2E_DEV=1` for `next dev`) |
| `pnpm bench:engine` | Engine benchmark, fails if p95 ≥ 300 ms |
| `pnpm db:local` | The local DB on its own (Neon-compatible HTTP endpoint on :4444) |
| `pnpm db:migrate` / `pnpm db:seed [--production]` | Against `DATABASE_URL` (Neon) |
| `pnpm import:prices file.csv [--source manual\|catalogue\|leaflet] [--dry-run]` | CSV price import |
| `pnpm import:osm --tiles ZA-GP ZA-KZN` (or `--tiles --all`) | OpenStreetMap stores + places per province, in ~55 km tiles; safe to repeat |
| `pnpm harness:receipts [--record]` | Receipt extraction accuracy (calls the real API: opt-in) |
| `pnpm tsx scripts/sync-messages.ts` | After editing `messages/en.json` (also runs before `pnpm build`) |
| `pnpm tsx scripts/build-engine-fixtures.ts` | After changing seed recipes or fixture prices |

Without Docker, PostGIS isn't on the machine, so the DB tests use PGlite. With Docker: `docker compose up -d` gives PostGIS on :5433 (dev) and :5434 (disposable test DB).

## Deploy to Vercel + Neon

1. **Neon:** create a project (region close to South Africa, e.g. `aws-eu-central-1`). Use the pooled connection string as `DATABASE_URL`. Leave `DATABASE_HTTP_ENDPOINT` empty.
2. **Schema and data** (from your machine, with `DATABASE_URL` in `.env.local`):
   `pnpm db:migrate && pnpm db:seed --production && pnpm import:osm --tiles --all`.
   The migrations create the `postgis` and `pg_trgm` extensions, and both are available on Neon. `--production` loads no fictional data and publishes no recipes.
3. **Vercel:** import the repo (framework: Next.js, install `pnpm install`, build `pnpm build`) and set the environment variables below for Production. `vercel.json` registers the crons.
4. **Domain:** attach it and set `APP_URL`. Add `https://<domain>/api/auth/callback/google` to the Google OAuth client, and verify the `EMAIL_FROM` domain in Resend.
5. **Content:** publish cook-tested recipes in `/admin/recipes`, and load prices (leaflets in `/admin/leaflets`, or `pnpm import:prices`). Then work through `docs/pilot-checklist.md`.

### Environment variables (`lib/env.ts` is the source of truth; `.env.example` mirrors it)

| Variable | Needed for | Without it |
|---|---|---|
| `DATABASE_URL` | everything | app can't start a DB call |
| `DATABASE_HTTP_ENDPOINT` | local dev only | — (leave empty on Vercel) |
| `APP_URL` | share links | defaults to localhost |
| `AUTH_SECRET` | sign-in | **required in production** |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in | Google button hidden |
| `RESEND_API_KEY`, `EMAIL_FROM` | email magic links | email sign-in unavailable in production |
| `ADMIN_EMAILS` | /admin | nobody is admin |
| `ANTHROPIC_API_KEY` | receipts, leaflets, tweaks | fixture mode: tweaks use a keyword parser; slips/leaflets "not available" |
| `CLAUDE_MODEL_VISION`, `CLAUDE_MODEL_FAST` | model choice | `claude-sonnet-5-5`, `claude-haiku-5-5` |
| `CLAUDE_FIXTURE_DIR` | tests | `fixtures/claude` |
| `BLOB_READ_WRITE_TOKEN` | storing receipt photos (private) | photos processed but never stored |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push | push card hidden; scheduler logs only |
| `CRON_SECRET` | Vercel Cron | cron routes refuse in production |
| `GOOGLE_PLACES_API_KEY` | street-address search | local OSM search only |
| `ENABLE_WEB_IMPORTERS` | — | must stay `false` (anything else fails startup) |
| `E2E` | Playwright only | **never set in production** |
| `SENTRY_DSN` | error monitoring | none (use Vercel monitoring) |

### CSV price import columns

`retailer_id, branch_id, product_name, brand, pack_qty, pack_unit, ingredient_id, price_cents, member_price_cents, special_price_cents, special_ends_on, observed_at`

Money is whole cents. `pack_unit` is `g|ml|unit` (or `kg|l|each`, which are converted). An empty `branch_id` means chain-wide. Each row is validated with Zod, and rejected rows are reported with their line number and reasons. Products and aliases are created when missing, and importing the same file twice adds nothing.

## Architecture

```
Browser (PWA)                      Next.js on Vercel (Node runtime)                       Neon Postgres + PostGIS
──────────────                     ────────────────────────────────                       ───────────────────────
ShopLocation, plan, list  ──fetch──▶ app/api/* (Zod in, {error:{code,message}} out) ──SQL──▶ 0001 stores/location
IndexedDB ticks, SW cache           lib/plans/service ─▶ packages/engine (pure)               0002 core (§12) + current_prices MV
localStorage shops                  lib/prices/snapshot ◀── current_prices                    0003 auth
                                    lib/claude ─▶ Anthropic API (only place)
                                    lib/notify ─▶ web-push      Vercel Cron ─▶ /api/cron/*
```

- **Engine (`packages/engine`).** Pure and deterministic, with no I/O, no clock and no `Math.random` (a test enforces this). The API layer builds a `PriceSnapshot`: offers for the household's branches, member prices only for cards held, expired specials dropped. It also loads published recipes and ingredients, then calls `plan/swapOptions/replace/remove`. Contracts are in `packages/engine/src/types.ts`. The algorithm: prune → greedy marginal cost (leftovers of bought packs cost 0) → local search (≤ 400 iterations) → exact re-price → two-shop split. Golden plans live in `packages/engine/test/golden/`.
- **Price pipeline.** Sources are leaflets (admin + Claude), receipts (households + Claude), CSV/manual (admins) and pluggable catalogue importers, all landing in `price_observations`. The `current_prices` materialised view applies §10.1 per product × scope: the most trusted price within 7 days, else the most recent within 21 days, else none. It's refreshed after each ingest and nightly, and `lib/prices/snapshot.ts` combines branch rows with chain-wide rows. Prices are never estimated: no offer means "can't price yet".
- **Claude boundary.** `lib/claude.ts` is the only API caller. It always uses tool use with Zod validation, so outputs are constraints (tweaks) or extracted lines (slips/leaflets), never prices shown as-is or recipes. Anything touching money is re-computed by the engine or matched against our catalogue. It also handles caching by content hash, per-household daily caps, cost logging and fixture mode.
- **Money.** Integer cents everywhere (`lib/money.ts`); formatting only at the edge. Savings = normal shelf price of the same packs − paid; pack sharing is shown separately.
- **Privacy.** Location is coarse (3 dp). Receipts need consent, have PII stripped, and their photos are deleted after 30 days. Export and delete are in Settings. Analytics are first-party only.
- **i18n.** All copy is in `messages/en.json`. `xh.json` and `af.json` mirror it with `TODO:` markers. `messages/runtime/*` (generated) fall back to English for un-reviewed strings and are precompiled at build time.

## Known limitations

1. **First-load JS on /plan is 184 KB gzip (159 KB brotli)** against the 180 KB gzip budget (§15). React 19 + Next 16 + next-intl account for about 170 KB; app code is about 13 KB after lazy-loading. Vercel serves brotli to modern browsers. Confirm with Lighthouse on a real phone.
2. **Edge runtime isn't used** (deprecated in Next 16). The routes stay edge-compatible.
3. **Rate limits are per server instance (in memory).** Claude caps are DB-backed and global.
4. **Local DB is PGlite + PostGIS, not Neon.** The same SQL runs on both, but run `pnpm db:migrate` against a Neon branch before go-live (human-todo).
5. **All 206 recipes are unpublished drafts written by Claude, and all fixture prices and `TEST` branches are fictional.** None of it is production data.
6. Seeded places are approximate centre points until the OSM import runs.
7. "Lowest in 8 weeks" (steal of the week) needs 8 weeks of price history before it appears.
8. Notification copy is generic: the cron doesn't re-run the engine, so "here are 6 suppers for R410" figures aren't included.
9. The leaflet review UI maps lines to existing product IDs. Creating brand-new products from a leaflet line is in the library (`newProduct`) but not yet in the form; use the CSV importer or the unmatched queue for now.
10. Receipt extraction accuracy is unmeasured until real slips are added (harness ready).
11. Account prompt visits are counted on the device (localStorage), so a cleared browser starts again.
12. Google Places, Resend, Google OAuth, Vercel Blob and web push have been exercised only through mocks and fixtures, not against the live services.
13. Engine tuning (λ weights, the R500 unpriced penalty) is untested on real prices. Watch savings % and list size on the pilot dashboard.

## Human to-do, in priority order

1. **Confirm the reconstructed rules and four money defaults.** Review `CLAUDE.md` and `PRD.md` (rebuilt from the .docx files). Confirm the 2026-11-21 defaults in `docs/decisions.md`: per plate = per serving, the savings split, no double counting between slips and plans, and "until the 25th" = up to the day before.
2. **Production infrastructure.** Neon project, Vercel project and every secret in the env table: `AUTH_SECRET`, `CRON_SECRET`, VAPID keys, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, Resend + verified domain, Google OAuth, `ADMIN_EMAILS`, `APP_URL`. Never set `E2E`.
3. **Stores.** `pnpm import:osm --tiles --all` (GP and KZN were loaded on 2026-11-21; EC and WC around the pilot areas), verify every branch within 15 km of both pilot areas, then delete `TEST` branches and seed places.
4. **Recipes.** Review and cook-test the 206 drafts and publish at least 60 in `/admin/recipes`.
5. **Prices.** Load real prices for every pilot chain (weekly leaflets via `/admin/leaflets`, or CSV), then reach ≥ 90% coverage in `/admin/prices`.
6. **Receipt accuracy.** Add 10 real receipt photos with `.expected.json` and run `pnpm harness:receipts --record` (target ≥ 90%).
7. **Translations.** isiXhosa and Afrikaans review of `messages/xh.json` and `af.json`, including the privacy notice.
8. **Device testing.** Lighthouse plus real-device tests (Android Chrome and an installed iOS PWA): push, install, offline list, bundle size.
9. **CI.** Create the GitHub repo and push so CI runs (the workflow file is ready).
10. **Launch checks.** Work through `docs/pilot-checklist.md`. Before enabling any retailer-website importer, get legal advice (PRD §18 #1).
