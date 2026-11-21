# Build progress

## Checkpoint
- Last completed: UI theme (docs/THEME.md): MealStretch design system applied to every screen (2026-11-21)
- Next: human-only work (docs/handover.md → "Human to-do, in priority order")
- Test status: 443 unit/db/engine (1 skipped until real receipt photos exist), 35 e2e (incl. 7 screenshots, overlap and 200% text checks), all green
- Open human-todo items: 22

## Phase 0: Repo foundation
- [x] 0.1 Next.js App Router + TS strict + Tailwind + pnpm in this repo
- [x] 0.2 pnpm workspace; packages/engine with its own Vitest config, no I/O imports
- [x] 0.3 Drizzle + @neondatabase/serverless; db/001_stores_location.sql as migration 0001
- [x] 0.4 lib/env.ts (Zod) + docker-compose.yml (PostGIS)
- [x] 0.5 next-intl with en/xh/af messages
- [x] 0.6 lib/money.ts + unit tests
- [x] 0.7 Vitest + Playwright + fast-check smoke tests; GitHub Actions CI
- [x] 0.8 package.json scripts; placeholder home page with BRAND + translated string

## Phase 1: Location & stores
Gate: LOC-1 PASS (ShopLocation.tsx getCurrentPosition low-accuracy/10 s, coarsen before fetch; reverseLabel test) · LOC-2 PASS (250 ms debounce, local first, shouldUseGoogle tests, session tokens) · LOC-3 PASS (widenRadius tests, location.test.ts nearby) · LOC-4 PARTIAL (local persistence done + e2e reload; user_shops sync on sign-up in Phase 8) · LOC-5 PASS (reports.test.ts, e2e report) · LOC-6 PASS (LocationBar in (site) layout; e2e opens sheet at shops step) · ONB-2 PASS (relevantPrograms tests, e2e chip wording); stored on household in Phase 4.
- [x] 1.1 ShopLocation in app layout (location bar on every user-facing page)
- [x] 1.2 /api/location + /api/stores/nearby on Edge; pure radius-widening function
- [x] 1.3 Loyalty chips in shops step, persisted with shops
- [x] 1.4 POST /api/reports/branch + "My shop isn't listed" form
- [x] 1.5 OSM attribution in store picker
- [x] 1.6 OSM import in human-todo; fictional TEST branches seeded
- [x] 1.7 Unit + Playwright tests (denied geo → search; mocked Somerset West)

## Phase 2: Catalogue, ingredients, recipes
Gate: §10.1 resolution PASS (tests/db/prices.test.ts) · CSV import PASS (prices-csv.test.ts, prices.test.ts importer) · seed idempotent PASS (seed.test.ts) · recipe refs PASS (recipes-seed.test.ts) · DoD Shoprite+Checkers coverage PASS · I18N-3 table recipe_translations PASS (schema) · publishing of recipes PARTIAL (human cook-test, human-todo).
- [x] 2.1 Drizzle schema + migration 0002 (core tables)
- [x] 2.2 current_prices materialised view + refresh_current_prices()
- [x] 2.3 scripts/seed.ts idempotent
- [x] 2.4 scripts/import-prices-csv.ts
- [x] 2.5 seed/prices.fixture.csv (fictional)
- [x] 2.6 62 draft recipes (68 total), unpublished drafts
- [x] 2.7 Tests: resolution rule, CSV validation, seed idempotency, recipe refs

## Phase 3: Planning engine
Gate: PLN-1 PASS (planner.test determinism, golden) · PLN-2 PASS (specialsUsed, effective prices in objective) · PLN-3 PASS (leftovers, sharesWith) · PLN-4 PASS (variety tests + properties) · PLN-5 PASS engine side (budget tests) · PLN-6/7/8/9 PASS engine side (meal actions tests) · PLN-10 PASS (unpriced tests) · PLN-11 PASS (pantry test) · PLN-12 PASS (assignShops tests) · §9.7 PASS (savings tests) · purity PASS (purity.test.ts) · bench PASS.
- [x] 3.1 Tests first (§9.10)
- [x] 3.2 Fixtures: 5 households + price snapshot
- [x] 3.3 Implement prune → greedy → local search → exact re-price → shop assignment
- [x] 3.4 PlanningEngine: plan, swapOptions, replace, remove
- [x] 3.5 Golden snapshots + fast-check properties
- [x] 3.6 pnpm bench:engine p95 < 300 ms

## Phase 4: Onboarding + plan screen
Gate: ONB-1 PASS (lib/household.ts device cookie; plans.test) · ONB-3 PASS (HouseholdForm portion styles; engine portions) · ONB-4 PASS (period.test payday maths) · ONB-5 PASS (avoid chips → exclusions; plans.test) · ONB-6 PASS (e2e first run, 3 screens after location) · PLN-1 PASS · PLN-5 PASS (e2e over-budget → Fit my budget → fewer suppers) · PLN-10 PASS (e2e unpriced) · ONB-2 stored on household PASS (plans.test).
- [x] 4.1 Anonymous household via device_id cookie
- [x] 4.2 O3 screen
- [x] 4.3 POST /api/plans
- [x] 4.4 P1 plan screen per §7.2 incl. Fit my budget
- [x] 4.5 Playwright: first run, over-budget, unpriced

## Phase 5: Meal actions, list, pantry
Gate: PLN-6 PASS (actions.test swap, e2e swap Tue) · PLN-7 PASS (cheaper never costs more, engine + db) · PLN-8 PASS (remove savedCents) · PLN-9 PASS (never-swap db test) · PLN-11 PASS (pantry + reprice) · LST-1 PASS (pack lines) · LST-2 PASS (store → aisle grouping) · LST-3 PASS (IndexedDB + PUT ticks, e2e offline) · LST-4 PASS (already-have e2e + db) · LST-5 PASS (staples section e2e) · LST-6 PASS (WhatsApp link e2e) · SAV-3 PASS (markShopped idempotent db test; 48 h prompt) · §15 offline PASS (offline.spec).
- [x] 5.1 Swap sheet, Cheaper, Remove, never-swap toggle
- [x] 5.2 Shopping list (grouping, tags, sticky total, already-have-it, staples, WhatsApp)
- [x] 5.3 Offline ticks (IndexedDB + PUT ticks) + service worker
- [x] 5.4 Mark as shopped → savings_event + leftovers into pantry, idempotent
- [x] 5.5 Tests: swap → offline ticks → persist; totals reconcile

## Phase 6: Savings, PWA, notifications
Gate: SAV-1 PASS (savings page, e2e) · SAV-2 PASS (savings.test: no double count, only up) · SAV-3 PASS (Phase 5) · SAV-4 PASS (steal test + e2e) · §14 rules PASS (notify.test quiet hours/caps/payday; db notify.test) · PWA manifest/icons/install prompt PASS (e2e manifest; install prompt after first plan) · Lighthouse PWA PARTIAL (human: real device + Lighthouse run, human-todo).
- [x] 6.1 Savings screen (lifetime, breakdown, receipt CTA)
- [x] 6.2 Steal of the week
- [x] 6.3 PWA manifest, icons, install prompt after first plan
- [x] 6.4 Web push with explanation screen
- [x] 6.5 Scheduler (Vercel Cron): tonight, month_end, payday, specials_day
- [x] 6.6 Tests: quiet hours, caps, payday maths

## Phase 7: Claude features
Gate: RCP-1 PASS (size/type/consent, compressImage) · RCP-2 PASS (claude.ts + extraction schema; fixture mode) · RCP-3 PASS (matching tests) · RCP-4 PASS (verified savings only matched + known normal) · RCP-5 PASS (branch receipt observations test) · RCP-6 PASS (PII tests, 30-day delete cron, consent) · ADM-2 PASS lib (leaflet test) / UI in 8.4 · ADM-3 PASS lib · PLN-13 PASS (tweak unit + e2e) · caps/cache PASS (claude.test) · 90% accuracy harness PARTIAL (needs real slips, human-todo).
- [x] 7.1 lib/claude.ts wrapper (tool use, Zod, cache, logs, caps, fixture mode)
- [x] 7.2 Receipts pipeline
- [x] 7.3 Admin leaflet flow (library + tests; admin screens land with 8.4)
- [x] 7.4 POST /api/plans/:id/tweak
- [x] 7.5 Tests: Zod rejections, PII, matching, caps, extraction harness

## Phase 8: Accounts, sharing, admin, pilot readiness
Gate: ACC-1 PASS · ACC-2 PASS (phase8.test merge; e2e anonymous → sign in → merged, second phone) · ACC-3 PASS (share test + e2e read/tick/revoke) · ACC-4 PASS (export/delete db test + e2e) · ADM-1 PASS (e2e 404 for non-admin) · ADM-2/3 PASS (UI + lib) · ADM-4 PASS (recipe editor + cost preview e2e) · ADM-5 PASS · ADM-6 PASS · I18N-1 PASS (messages test) · I18N-2/4 PARTIAL (human review) · I18N-3 PASS (recipe_translations used when reviewed) · §16 events PASS (events-coverage test) · pilot dashboard PASS.
- [x] 8.1 Auth.js (Google + email) + anonymous merge
- [x] 8.2 Revocable share links
- [x] 8.3 Settings: export + delete
- [x] 8.4 Admin: recipe editor, branch reports, price health
- [x] 8.5 events tracking + pilot dashboard
- [x] 8.6 docs/pilot-checklist.md
- [x] 8.7 Playwright: anonymous → sign in → merged

## Final
- [x] Full audit, docs/handover.md, `chore: MVP complete`

## UI theme (docs/THEME.md)
- [x] T.1 Tokens in lib/brand.ts → tailwind.config.ts (CSS variables), contrast unit test, no-raw-colour guard test
- [x] T.2 Plus Jakarta Sans + Inter via next/font (self-hosted, Latin)
- [x] T.3 components/ui: Button, Card, Chip, Badge, SavingsChip, MoneyText, BottomNav, TopBar, HeroCard, ShortcutTile, StatRing, Sheet, ListRow, SectionHeader, CoachMark, EmptyState, Skeleton, Toast (+ Wordmark); /dev/ui demo
- [x] T.4 ShopLocation and every built screen restyled (home, plan, tonight/cook, list, savings, receipts, onboarding O1–O3, settings, sign-in, privacy, shared list, admin)
- [x] T.5 Screenshot tests at 360 × 780, nav-overlap and 200% text e2e checks
