# Build progress

## Checkpoint
- Last completed: Phase 0 (2026-11-21)
- Next: Phase 1, step 1.1
- Test status: 40 unit/db/engine, 1 e2e, all green
- Open human-todo items: see docs/human-todo.md

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
- [ ] 1.1 ShopLocation in app layout (location bar on every user-facing page)
- [ ] 1.2 /api/location + /api/stores/nearby on Edge; pure radius-widening function
- [ ] 1.3 Loyalty chips in shops step, persisted with shops
- [ ] 1.4 POST /api/reports/branch + "My shop isn't listed" form
- [ ] 1.5 OSM attribution in store picker
- [ ] 1.6 OSM import in human-todo; fictional TEST branches seeded
- [ ] 1.7 Unit + Playwright tests (denied geo → search; mocked Somerset West)

## Phase 2: Catalogue, ingredients, recipes
- [ ] 2.1 Drizzle schema + migration 0002 (core tables)
- [ ] 2.2 current_prices materialised view + refresh_current_prices()
- [ ] 2.3 scripts/seed.ts idempotent
- [ ] 2.4 scripts/import-prices-csv.ts
- [ ] 2.5 seed/prices.fixture.csv (fictional)
- [ ] 2.6 54 draft recipes (60 total), unpublished drafts
- [ ] 2.7 Tests: resolution rule, CSV validation, seed idempotency, recipe refs

## Phase 3: Planning engine
- [ ] 3.1 Tests first (§9.10)
- [ ] 3.2 Fixtures: 5 households + price snapshot
- [ ] 3.3 Implement prune → greedy → local search → exact re-price → shop assignment
- [ ] 3.4 PlanningEngine: plan, swapOptions, replace, remove
- [ ] 3.5 Golden snapshots + fast-check properties
- [ ] 3.6 pnpm bench:engine p95 < 300 ms

## Phase 4: Onboarding + plan screen
- [ ] 4.1 Anonymous household via device_id cookie
- [ ] 4.2 O3 screen
- [ ] 4.3 POST /api/plans
- [ ] 4.4 P1 plan screen per §7.2 incl. Fit my budget
- [ ] 4.5 Playwright: first run, over-budget, unpriced

## Phase 5: Meal actions, list, pantry
- [ ] 5.1 Swap sheet, Cheaper, Remove, never-swap toggle
- [ ] 5.2 Shopping list (grouping, tags, sticky total, already-have-it, staples, WhatsApp)
- [ ] 5.3 Offline ticks (IndexedDB + PUT ticks) + service worker
- [ ] 5.4 Mark as shopped → savings_event + leftovers into pantry, idempotent
- [ ] 5.5 Tests: swap → offline ticks → persist; totals reconcile

## Phase 6: Savings, PWA, notifications
- [ ] 6.1 Savings screen (lifetime, breakdown, receipt CTA)
- [ ] 6.2 Steal of the week
- [ ] 6.3 PWA manifest, icons, install prompt after first plan
- [ ] 6.4 Web push with explanation screen
- [ ] 6.5 Scheduler (Vercel Cron): tonight, month_end, payday, specials_day
- [ ] 6.6 Tests: quiet hours, caps, payday maths

## Phase 7: Claude features
- [ ] 7.1 lib/claude.ts wrapper (tool use, Zod, cache, logs, caps, fixture mode)
- [ ] 7.2 Receipts pipeline
- [ ] 7.3 Admin leaflet flow
- [ ] 7.4 POST /api/plans/:id/tweak
- [ ] 7.5 Tests: Zod rejections, PII, matching, caps, extraction harness

## Phase 8: Accounts, sharing, admin, pilot readiness
- [ ] 8.1 Auth.js (Google + email) + anonymous merge
- [ ] 8.2 Revocable share links
- [ ] 8.3 Settings: export + delete
- [ ] 8.4 Admin: recipe editor, branch reports, price health
- [ ] 8.5 events tracking + pilot dashboard
- [ ] 8.6 docs/pilot-checklist.md
- [ ] 8.7 Playwright: anonymous → sign in → merged

## Final
- [ ] Full audit, docs/handover.md, `chore: MVP complete`
