# CLAUDE.md: MealStretch build rules

These rules are non-negotiable. `PRD.md` is the product spec; `docs/BUILD.md` is the order of work.
(Reconstructed from PRD.md and docs/BUILD.md §6 on 2026-11-21; the original file was not available.)

## Stack

- Next.js (App Router) + TypeScript `strict` + Tailwind, pnpm workspace.
- Neon Postgres + PostGIS (+ `pg_trgm`), Drizzle ORM with `@neondatabase/serverless` (HTTP driver).
- Zod for every input boundary (API bodies, query strings, CSV rows, env, LLM output).
- next-intl for all UI copy (`messages/en.json`, `xh.json`, `af.json`).
- Vitest (+ fast-check) for unit/integration, Playwright for e2e.
- Claude API via `@anthropic-ai/sdk`, only inside `lib/claude.ts`.
- Auth.js (Google + Resend email link), `web-push`, Vercel Blob, Vercel Cron.

## Money

1. All money is **integer cents** (`Cents = number`, asserted with `assertCents`). Never floats, never `parseFloat` on money, never `toFixed` for maths. Format only at the edge with `formatRand()` from `lib/money.ts`.
2. **Never estimate a price.** No offer → the item is *unpriced*, listed as "can't price yet" and excluded from totals with an explicit note.
3. **Every price shown has a source and a date** (`source`, `observedAt`). Prices older than 7 days are flagged stale; older than 21 days are excluded.
4. **Savings** are always against the defined baseline (PRD §9.7): normal = shelf price of the same packs, no special, no card. Pack efficiency is shown separately and never added into savings.
5. **Claude never outputs prices, totals or recipes shown to users.** Anything an LLM returns that would change money is re-computed by the engine.

## Engine purity (`packages/engine`)

- No I/O: must not import `next`, `lib/db`, `fetch`, any LLM SDK, `fs`, or anything with side effects.
- Deterministic: no `Date.now()`, `new Date()` without an argument, or `Math.random()`. "Today" comes from `PriceSnapshot.asOf`; randomness from the seeded PRNG (mulberry32) using `PlanRequest.seed`.
- Contracts live in `packages/engine/src/types.ts`. Implement against them; don't redesign them.

## Data and security

- **Parameterised SQL only.** Use Drizzle query builder or the `sql\`\`` tagged template. Never build SQL with string concatenation or `sql.raw` on user input.
- Migrations are plain SQL files in `db/migrations/NNNN_name.sql`, applied in order by `scripts/migrate.ts`; the Drizzle schema in `db/schema/` mirrors them (a test checks they agree).
- **Coarse location only:** coordinates rounded to 3 dp before leaving the device and before storing.
- **POPIA:** consent before receipts and push; strip card numbers, names and phone numbers from receipt data; receipt images auto-deleted after 30 days; export + delete available.
- **No secrets in code.** All config comes through `lib/env.ts` (Zod, fail fast). Keep `.env.example` in sync with `lib/env.ts`.
- **Web importers disabled:** `ENABLE_WEB_IMPORTERS` stays `false`. Never enable or implement scraping of retailer websites.
- Admin routes are role-checked **server-side** against `ADMIN_EMAILS`.
- Rate-limit `/api/location`, `/api/reports/branch`, `/api/plans/*/tweak`, `/api/receipts`.

## Copy and brand

- **No hard-coded user-facing copy** in components: every string goes through next-intl. xh/af files mirror en with `TODO:` markers until a human reviews them.
- The product name appears only in `lib/brand.ts` and `messages/*.json`. Components use `BRAND`.

## UI

- Follow `docs/THEME.md`. Build screens from `components/ui/*` and the Tailwind tokens (`bg-surface`, `text-primary`, `text-savings-text`, `rounded-card`, `shadow-card`, …).
- Never hard-code a hex value or a raw Tailwind palette class (`gray-*`, `white`, …) in `app/` or `components/`; `tests/unit/theme.test.ts` enforces this. New colours go in `lib/brand.ts` with a contrast pair in `TEXT_PAIRS`.
- Bright `savings` amber is for fills, rings and icons only; savings text uses `text-savings-text`.
- Pages clear the floating nav (`pb-nav` is applied by the site layout); sticky footers use `bottom-above-nav`.

## Code hygiene

- No leftover `console.log` (use `lib/log.ts` structured logger).
- Never weaken or delete a test to make it pass. Fix the code, or log in `docs/decisions.md` why the test was wrong.
- Log non-obvious decisions in `docs/decisions.md` (date, decision, reason, PRD section).
- Anything that needs a human goes into `docs/human-todo.md` as `- [ ] (Phase N) task: why / exact steps`.
- Integration tests run against a disposable database (in-memory PGlite+PostGIS, or `TEST_DATABASE_URL`), never one with real data.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Next dev server (starts the local DB HTTP shim when `DATABASE_URL` is local) |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` for the app and every workspace package |
| `pnpm lint` | ESLint |
| `pnpm test` | All Vitest suites (app + `packages/engine`) |
| `pnpm test:e2e` | Playwright |
| `pnpm db:migrate` | Apply `db/migrations/*.sql` in order |
| `pnpm db:seed` | Idempotent seed: ingredients, recipes, test branches |
| `pnpm db:local` | Run the local PGlite+PostGIS database behind a Neon-compatible HTTP endpoint |
| `pnpm import:prices <file.csv>` | CSV price importer |
| `pnpm import:osm` | OpenStreetMap store import (Overpass) |
| `pnpm bench:engine` | Engine benchmark: 14 days × 200 recipes, prints p50/p95 |
