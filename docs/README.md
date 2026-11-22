# MealStretch

**A budget-first supper planner for South African households.** Tell it how much money you have, how many people you're feeding and until when, and it plans the suppers and builds a priced shopping list for the shops near you.

Live: <https://meal-stretch.vercel.app>

## What it does

- **Plans suppers around your budget.** You give the amount, the number of people and the day the money must last until. It picks suppers from 206 recipes and says how much each plate costs. The recipes come from South African cooking and other countries, and include quick 15- and 30-minute meals. If the money doesn't stretch, it offers fewer suppers instead of going over.
- **Builds a shopping list for your shops.** The list is grouped by store, then by aisle. Every price shows where it came from and when. Packs are worked out properly: if two meals use the same bag of rice, you buy one bag. Specials and loyalty-card prices are used when they're cheaper.
- **Finds shops near you.** It uses your phone's location (rounded to about 100 m), or you can search for a suburb. The shops come from OpenStreetMap for Gauteng, KwaZulu-Natal, the Western Cape, the Eastern Cape and part of the Free State.
- **Counts real savings.** Savings are always measured against the normal shelf price of the same packs. If you scan your till slip, the savings are checked against what you actually paid.
- **Works on a cheap phone with little data.** It installs as an app (PWA), you can tick the list offline, and the list can be shared on WhatsApp. It's in English, with isiXhosa and Afrikaans on the way.
- **Doesn't make you sign up.** Everything works without an account. You can sign in with Google or an email link to keep your plans on another phone.

### Where the prices come from

No price is made up. Each one is a real observation with a source and a date, from one of these:

- retailer leaflets (read by Claude, then approved by an admin);
- till slips that users scan;
- prices entered or imported by an admin;
- *guide prices* looked up online, used to fill gaps. These have the lowest trust, are shown as "may have changed", and are replaced as soon as a real price arrives.

Prices older than 7 days are marked stale, and prices older than 21 days aren't used (90 days for guide prices).

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4 |
| Planning engine | Pure TypeScript package in `packages/engine`: no I/O, deterministic, p95 under 300 ms for 14 days × 200 recipes |
| Database | Postgres + PostGIS + `pg_trgm` on Neon, Drizzle ORM. Locally: PGlite + PostGIS (no Docker or install needed) |
| AI | Claude API (`@anthropic-ai/sdk`), only in `lib/claude.ts`: reading till slips and leaflets, plan tweaks in plain language, meal ideas. Claude never sets a price or a total; the engine recalculates them |
| Auth | Auth.js: Google, and email magic links through Resend |
| Hosting | Vercel (Cron, Blob for receipt photos, Web Analytics, Speed Insights) and web push |
| Translations | next-intl (`messages/en.json`, `xh.json`, `af.json`) |
| Tests | Vitest (+ fast-check) and Playwright |

## Run it locally

You need **Node 22+** and **pnpm 10**.

```bash
pnpm install
cp .env.example .env.local   # the defaults use the local database
pnpm dev                     # starts the local database, then Next.js on http://localhost:3000
```

The first start takes about 20 seconds while the local database loads PostGIS and the seed data. Then open <http://localhost:3000>, search for "Somerset West" or "Bluewater Bay", pick a `TEST …` shop and make a plan. The local shops and prices are made up, for testing.

The local data is stored in `.pglite/dev`. Delete that folder to start fresh.

You don't need any API keys to run it locally. Without an Anthropic key, Claude features use recorded responses, and email sign-in links aren't sent: open `http://localhost:3000/api/dev/mailbox?email=you@example.com` to get the link.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Local database + Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / run it |
| `pnpm typecheck` | TypeScript for the app and the engine |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit, database and engine tests (in-memory database, never real data) |
| `pnpm test:e2e` | Playwright end-to-end tests on a production build |
| `pnpm bench:engine` | Engine speed benchmark |
| `pnpm db:migrate` | Apply `db/migrations/*.sql` in order |
| `pnpm db:seed` | Load ingredients, recipes and test shops (safe to repeat) |
| `pnpm import:osm --tiles ZA-GP ZA-KZN` | Import shops and places from OpenStreetMap by province (`--tiles --all` for all nine) |
| `pnpm import:prices file.csv` | Import prices from a CSV file |
| `pnpm import:leaflet leaflet.pdf --retailer checkers` | Read a leaflet with Claude into review batches at `/admin/leaflets` |

To run a script against the production database, put `DATABASE_URL` in a git-ignored env file and leave `DATABASE_HTTP_ENDPOINT` empty.

## Project layout

```text
app/              Pages, API routes and admin screens (Next.js App Router)
components/       UI; components/ui is the design system (see docs/THEME.md)
lib/              Server logic: plans, prices, location, receipts, auth, Claude wrapper, env
packages/engine/  The planning engine (pure TypeScript, no I/O)
db/               SQL migrations and the Drizzle schema that mirrors them
seed/             Ingredients, recipes, retailers, test shops, guide prices
scripts/          Dev server, migrations, seeding and importers
messages/         Translations (en, xh, af)
tests/            unit/, db/, e2e/
docs/             All documentation, including the spec (see below)
```

## Deploying

The app runs on **Vercel**, with **Neon** for the database. The full guide, including every environment variable and what happens without it, is in [handover.md](handover.md#deploy-to-vercel--neon). In short:

1. Create a Neon database and set `DATABASE_URL`.
2. Run `pnpm db:migrate && pnpm db:seed --production`, then import the shops with `pnpm import:osm --tiles --all`.
3. Import the repo in Vercel and set the environment variables. `lib/env.ts` lists all of them and `.env.example` mirrors it. `AUTH_SECRET` is required in production.
4. Switch on Web Analytics and Speed Insights in the Vercel dashboard.

## Documentation

| File | What's in it |
| --- | --- |
| [PRD.md](PRD.md) | The product spec: what to build and why |
| [CLAUDE.md](../CLAUDE.md) | Rules every change must follow (money, privacy, copy, UI) |
| [BUILD.md](BUILD.md) | The order the MVP was built in |
| [handover.md](handover.md) | What was built, how to run and deploy it, environment variables |
| [THEME.md](THEME.md) | Design system: colours, type, components |
| [decisions.md](decisions.md) | Every non-obvious decision, with the date and reason |
| [human-todo.md](human-todo.md) | Jobs that need a person (accounts, keys, content, legal) |
| [pilot-checklist.md](pilot-checklist.md) | Checks before the pilot launch |

## Contributing

- **Make each change on its own branch** and open a pull request. Don't commit straight to `main`.
- **Follow [CLAUDE.md](../CLAUDE.md).** The main rules:
  - money is integer cents;
  - every price shown has a source and a date;
  - no hard-coded user-facing text (use next-intl);
  - no hard-coded colours (use the theme tokens);
  - parameterised SQL only.
- **Run the checks before opening a PR:** `pnpm typecheck && pnpm lint && pnpm test`.
- **Never commit secrets.** `.env.local` and other env files are git-ignored. All configuration goes through `lib/env.ts`.
- **Don't add scraping of retailer websites.** `ENABLE_WEB_IMPORTERS` must stay `false`. Prices come from leaflets, receipts, admin entry and guide prices.

## Privacy

MealStretch is built for POPIA:

- **Location:** stored only to about 100 m.
- **Till slips:** scanned only with consent. Card numbers, names and phone numbers are removed, and photos are deleted after 30 days.
- **Notifications:** sent only with consent.
- **Tracking:** no ad trackers. Usage stats are cookieless.
- **Your data:** you can download or delete it in Settings at any time.

## Credits

Shop and place data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database Licence (ODbL).
