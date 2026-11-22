# MealStretch: master build prompt for Claude Code

**How to start:** open Claude Code in the repo folder and paste:

```
Read docs/BUILD.md and follow it from start to finish.
```

**If a session ends or the context resets**, paste the same line again. Claude resumes from `docs/progress.md`.

## 1. Your role and mission

You are the lead engineer building **MealStretch**, a budget-first meal planning app for South African households (pilot areas: Bluewater Bay, Gqeberha and Somerset West). You will build the **entire MVP, Phases 0 to 8, in one continuous run**, without waiting for me between phases.

Sources of truth, in priority order:

- `CLAUDE.md`: build rules. Non-negotiable.
- `docs/PRD.md`: product spec. Requirement IDs (LOC-1, PLN-3, ...) are what you build and test against.
- `packages/engine/src/types.ts`: engine contracts. Implement against them; don't redesign them.
- This file: the order of work, the phase gates and the autonomy rules.

## 2. Startup procedure (every session)

- Read `CLAUDE.md`, `docs/PRD.md`, `docs/progress.md`, `docs/decisions.md`, and `docs/human-todo.md` if it exists.
- Run `git status` and `git log --oneline -20`.
- **If** `docs/progress.md`** already has a checkpoint:** resume from the first unchecked item. Don't redo finished work. Say in one line where you're resuming, then continue.
- **If this is the first session:** a. Rewrite `docs/progress.md` as a checklist of every step in §5 below (one checkbox per numbered step, grouped by phase), plus a `## Checkpoint` section at the top. b. Create your own task list with all phases. c. Ask me **one single batch** of questions, but only about things that would be expensive to get wrong (money calculations, privacy, data model) and that the PRD doesn't answer. Also ask for any credentials you need (see §4). Then **wait once** for my answers. d. After my answers, run every phase to the end without asking for permission between phases.

## 3. Autonomy rules

**Keep going.** After each phase passes its gate (§6), commit, update the checkpoint and immediately start the next phase. Don't ask "should I continue?".

**Stop and ask me ONLY if:**

- an action is destructive or irreversible: dropping or overwriting a database with real data, force-pushing, deleting branches, deploying to production;
- it would spend real money beyond development use (bulk Claude or Google calls, paid services);
- it touches the legal gate: never enable retailer website importers (`ENABLE_WEB_IMPORTERS` stays `false`);
- you've hit the same failure 3 times with 3 genuinely different approaches. Then explain what you tried.
**Everything else that needs a human goes into** `docs/human-todo.md`**, and you keep working.** Examples: run the OSM import against Neon, review the recipe drafts, cook-test recipes, add real receipt photos, review isiXhosa and Afrikaans strings, generate VAPID keys, register domains. Format: `- [ ] (Phase N) task: why it's needed / exact command or steps`.

**Make reasonable decisions yourself** for UI details, library choices within the CLAUDE.md stack, file structure and naming. Log any non-obvious decision in `docs/decisions.md` (date, decision, reason, PRD section).

## 4. Credentials and environment

- **Never block on a missing key.** Build with mocks or fixtures, put the missing key in `docs/human-todo.md`, and continue.
- **Database:** add `docker-compose.yml` with a `postgis/postgis:16-3.4` service so tests run locally against real PostGIS. Use `DATABASE_URL` from `.env.local` if I provide a Neon branch; otherwise use the local container. Integration tests must run against a disposable test database, never one with real data.
- **Claude API:** without `ANTHROPIC_API_KEY`, the Claude wrapper uses recorded fixture responses in tests. The real API is only called by an opt-in script.
- **Google Places:** optional. The app must work without it (local OSM search).
- Keep `.env.example` and `lib/env.ts` in sync whenever you add a variable.

## 5. The build: phases and steps

Work strictly in order. Each numbered step is a checkbox in `docs/progress.md`.

### Phase 0: Repo foundation

0.1 Set up Next.js App Router + TypeScript strict + Tailwind + pnpm **in this existing repo**. Do not let a generator overwrite docs/, CLAUDE.md, db/, lib/, app/api/, components/, scripts/, seed/, packages/, docs/. If a generator is easier, run it in a temp folder and copy over only what's needed. 0.2 pnpm workspace; `packages/engine` as its own package with its own Vitest config. It must not import next, lib/db, fetch, or any LLM SDK. 0.3 Drizzle ORM + `@neondatabase/serverless`. `db/001_stores_location.sql` becomes raw migration 0001, unchanged. 0.4 `lib/env.ts` (Zod, fail fast with clear messages) and `docker-compose.yml` (PostGIS). 0.5 `next-intl` with `messages/en.json`, `messages/xh.json`, `messages/af.json` (xh/af mirror en with `TODO:` markers). 0.6 `lib/money.ts`: `formatRand(cents)` → `R1,234.50`, parsing helpers, negatives; integer-cents assertion helper. Full unit tests. 0.7 Vitest + Playwright + fast-check configured, one smoke test each. GitHub Actions: install → typecheck → unit tests. 0.8 package.json scripts from CLAUDE.md. Placeholder home page using `BRAND` from `lib/brand.ts` and a translated string.

### Phase 1: Location & stores (LOC-1…6, ONB-2)

The code already exists and was tested against PostGIS (see `docs/location-module.md`). **Integrate it; don't rewrite it.** 1.1 Put `components/ShopLocation.tsx` in the app layout (location bar on every user-facing page). 1.2 `/api/location` and `/api/stores/nearby` on the Edge runtime using `lib/env.ts`. Extract the radius-widening logic into a pure, tested function. 1.3 Loyalty chips in the shops step: "I have this card ✓" (never "Enrol"), only for retailers among the chosen shops, persisted with the shops. 1.4 `POST /api/reports/branch` (Zod, rate limit) + "My shop isn't listed" form. 1.5 "© OpenStreetMap contributors" attribution in the store picker. 1.6 Add the OSM import for Eastern Cape + Western Cape to `docs/human-todo.md` with exact commands. Seed a few **fictional** test branches near Bluewater Bay and Somerset West for local dev/tests (clearly named `TEST ...`). 1.7 Tests: unit (coarsen, distanceLabel, inSouthAfrica, radius widening); Playwright: (a) geolocation denied → search "Bluewater Bay" → pick a Checkers branch → reload → persisted; (b) geolocation mocked in Somerset West → label + stores shown.

### Phase 2: Catalogue, ingredients, recipes (PRD §10.1, §11, §12)

2.1 Drizzle schema + migration 0002: households, ingredients, products, product_aliases, product_categories, price_observations, ingest_batches, unmatched_items, recipes, recipe_ingredients, recipe_translations. 2.2 `current_prices` materialised view implementing §10.1 (receipt > leaflet > catalogue > manual within 7 days; else newest within 21 days; else none) + `refresh_current_prices()`. 2.3 `scripts/seed.ts`: idempotent load of `seed/ingredients.sample.json` and `seed/recipes.sample.json`. 2.4 `scripts/import-prices-csv.ts` (columns: retailer_id, branch_id?, product_name, brand, pack_qty, pack_unit, ingredient_id, price_cents, member_price_cents, special_price_cents, special_ends_on, observed_at). Zod per row; report rejected rows with reasons; create products + aliases when missing. 2.5 `seed/prices.fixture.csv`: **fictional** prices (labelled as such in a header comment) for Checkers, Shoprite, Pick n Pay and SPAR covering every seed ingredient, with specials, member prices and one stale row. Dev/test only; never present as real. 2.6 Draft 54 more SA budget suppers (total 60) into `seed/recipes.draft.json` with `"published": false`, canonical ingredient ids only (add ingredients as needed). Add "review + cook-test recipe drafts" to human-todo. 2.7 Tests: resolution rule (fresh receipt beats older leaflet; 8-day-old flagged stale; 22-day-old excluded), CSV validation, seed idempotency, every recipe references existing ingredients.

### Phase 3: Planning engine (PRD §9), the most important phase

3.1 **Test-first.** Write the tests from §9.10 before implementing: pack DP (exact, overshoot, multi-pack mix, no offers → unpriced), portions (0.75/1.0/1.4, rounding to 0.5 servings and roundTo), effective vs normal price, savings (= specials + member; packEfficiency separate and NOT in savings), variety constraints, pantry deduction, budget fallback + maxAffordableDays, unpriced handling, determinism (same seed → deep-equal). 3.2 Fixtures in `packages/engine/fixtures/`: 5 households (single; couple; family of 4 with a big eater; family of 6 on a tight budget; household excluding pork + fish) + a price snapshot from `seed/prices.fixture.csv`. 3.3 Implement per §9.5: prune → greedy marginal cost (leftovers of bought packs cost 0) → local search (replace + swap; ≤ 400 iterations or 150 ms) → exact re-price with the §9.4 DP → shop assignment (PLN-12 thresholds). Pure: inject today via `PriceSnapshot.asOf`; seeded PRNG (mulberry32); no `Date.now()` / `Math.random()`. 3.4 Implement the `PlanningEngine` interface: plan, swapOptions, replace, remove. 3.5 Golden snapshot tests (5 households) + fast-check properties (totals = Σ lines; savings ≥ 0; paid ≤ normal; no hard-constraint violations). 3.6 `pnpm bench:engine`: 14 days × 200 synthetic recipes; print p50/p95; **p95 < 300 ms** or optimise until it is.

### Phase 4: Onboarding + plan screen (§7.1–7.2; ONB-1, 3, 4, 5, 6; PLN-1, 5, 10)

4.1 Anonymous household via httpOnly `device_id` cookie (1 year). No login in this flow. 4.2 O3 screen: people stepper, optional portion styles, budget (numeric keypad), "until when" chips (7 days / until the 25th / until month-end / pick a date; 3–14 days), quick avoid chips. CTA "Plan my suppers". 4.3 `POST /api/plans`: household + shops + current_prices → PriceSnapshot → engine → store request, result, engine version and seed. 4.4 P1 plan screen exactly per §7.2: total, per plate, savings in R and %, budget status, specials used, "Prices checked ", unpriced link. Over budget → red status + "Fit my budget" (cheapest mode, then offer maxAffordableDays). 4.5 Playwright: first run (location mocked) → plan visible within ≤ 3 screens after location; over-budget path; unpriced shown and excluded from totals.

### Phase 5: Meal actions, list, pantry (§7.3–7.4; PLN-6…9, 11; LST-1…5; SAV-3)

5.1 Swap sheet (3 options with deltas), Cheaper, Remove (shows rands saved), never-swap protein toggle. 5.2 Shopping list: pack-level lines grouped by store then aisle; special/member/stale tags; sticky total + ticked count; "Already have it" → pantry + re-price; pantry staples section (off by default) with its own subtotal; WhatsApp share text (LST-6). 5.3 Offline: ticks in IndexedDB, synced via `PUT /api/plans/:id/ticks`; service worker caches plan, list and recipes. 5.4 Mark as shopped (list complete or 48 h after start) → savings_event + leftovers into pantry, idempotent. 5.5 Tests: Playwright plan → swap Tue → tick 3 offline → reload online → ticks persist; unit tests that totals reconcile after every action.

### Phase 6: Savings, PWA, notifications (SAV-1…4; §14; §15)

6.1 Savings screen: lifetime total (only goes up; `unique(kind, ref_id)` prevents double counting), breakdown, receipt CTA. 6.2 Steal of the week (SAV-4). 6.3 PWA manifest from `lib/brand.ts`, icons, install prompt only after the first plan. 6.4 Web push (`web-push`, VAPID from env; missing keys → human-todo). Permission requested only after the first plan, with an explanation screen first. 6.5 Scheduler via Vercel Cron: tonight, month_end, payday, specials_day. Max 1/day except tonight; quiet hours 20:00–07:00 Africa/Johannesburg; per-kind opt-out; log to notification_log. 6.6 Tests: quiet hours, caps, payday maths (default the 25th; if a rule is ambiguous, log the choice in decisions.md rather than stopping).

### Phase 7: Claude features (RCP-1…6; ADM-2, 3; PLN-13; §9.8, §10.4)

7.1 `lib/claude.ts`: `@anthropic-ai/sdk` wrapper, tool use with the §10.4 schema, Zod-validated output, content-hash cache, cost/latency logs, model IDs from env, per-household daily caps (10 tweaks, 5 receipts), fixture mode when there's no key. 7.2 Receipts: client compression ≤ 2 MB → private Vercel Blob → async processing + polling → totals check ±2% → needs_review; matching (alias → trigram + size → unmatched queue); verified savings only from matched lines with a known normal price; branch-level price_observations (source `receipt`); strip card numbers, names and phone numbers; auto-delete images after 30 days; first-use consent. 7.3 Admin leaflet flow: upload → extract → review table (edit / approve / reject per line) → publish as `leaflet` observations → refresh current_prices. 7.4 `POST /api/plans/:id/tweak`: text → Zod-validated PlanRequest patch → engine re-run. Claude never returns prices or recipes to users. 7.5 Tests: Zod rejections, PII stripping, matching, caps; extraction harness over `fixtures/receipts/` (skipped when empty; add "add real receipt photos" to human-todo).

### Phase 8: Accounts, sharing, admin, pilot readiness (ACC-1…4; ADM-1, 4, 5, 6; I18N-1…4; §16)

8.1 Auth.js: Google + email magic link (Resend). Merge the anonymous household into the account on sign-in without duplicates. Account prompt only on the §7.7 triggers. 8.2 Revocable household share links (read + tick). 8.3 Settings: JSON export; delete (removes household data; keeps price observations with the household link removed). 8.4 Admin (server-side role check from ADMIN_EMAILS): recipe editor with cost preview at a chosen branch; branch-report queue; price health dashboard. 8.5 `events` tracking for every §16 event + pilot dashboard (activation funnel, W1–W4 retention, savings distribution, budget fit, list size). 8.6 `docs/pilot-checklist.md`: branches verified in both pilot areas, recipes cook-tested and published, prices fresh, xh + af strings reviewed, POPIA notice live, error monitoring, backups. 8.7 Playwright: anonymous use → sign in → data merged.

## 6. Phase gate (run at the end of EVERY phase before moving on)

- List every requirement ID in scope for the phase: PASS / FAIL / PARTIAL, with evidence (file + test name). Fix FAILs now. A PARTIAL is only allowed when the missing piece is human-only, and then it goes into human-todo.
- Check the CLAUDE.md rules against the changed code: integer cents; pure engine; no LLM prices; no estimated prices; source + date on every price; parameterised SQL; coarse location; no hard-coded copy; no secrets; web importers disabled.
- Search the code for: float money, `Date.now()` / `Math.random()` in packages/engine, string-built SQL, "MealStretch" outside lib/brand.ts and messages, leftover `console.log`.
- Run `pnpm typecheck && pnpm test` (+ `pnpm test:e2e` for UI phases). All green.
- Commit: `feat(phase-N): <summary>`.
- Update `docs/progress.md`: tick the steps and rewrite the `## Checkpoint` block:
`## Checkpoint`

```
- Last completed: Phase N (<date>)
- Next: Phase N+1, step N+1.1
- Test status: <x> unit, <y> e2e, all green
- Open human-todo items: <count>
```



- Post a 3–5 line phase summary in chat, then **start the next phase immediately**.

## 7. Working habits

- Small commits on green within a phase are fine; the phase commit at the gate is required.
- Before a long or risky step, make sure the checkpoint reflects reality, so a context reset loses nothing.
- If the conversation gets long, rely on `docs/progress.md` and the code, not memory. Re-read the PRD section for the current phase before starting it.
- Never weaken or delete a test to make it pass. Fix the code, or log why the test was wrong in decisions.md.
- Prefer boring, well-known solutions. Keep client JS small (§15 budgets).

## 8. When all phases are done

- Run the full phase-gate audit across the whole codebase.
- Write `docs/handover.md`: what was built, how to run it locally, how to deploy to Vercel + Neon, environment variables, architecture overview (engine, price pipeline, Claude boundary), known limitations, and the full human-todo list in priority order.
- Final commit: `chore: MVP complete`.
- Reply with a short summary and the top 5 human-todo items I should do first.

## Extra prompts (only if needed)

**Fix a bug:** `Bug: <what happened + error>. Reproduce it with a failing test, explain the root cause in 2–3 sentences, apply the smallest fix, run the full suite, commit as fix(<area>), then continue the build from the checkpoint.`

**Change request:** `Change: <what I want>. List the affected PRD sections, requirement IDs, tables and code; update docs/PRD.md and docs/decisions.md; implement and test; update progress.md; then continue the build from the checkpoint.`
