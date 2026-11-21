# Pilot readiness checklist

Pilot areas: **Bluewater Bay (Gqeberha)** and **Somerset West (Helderberg)**, 15 km radius each (PRD §5, §17).
Tick every box before inviting the first households. Items marked *(built)* are done in code and only need checking in production.

## Stores and location
- [ ] OSM import run for ZA-EC and ZA-WC against production Neon (`pnpm import:osm ZA-EC ZA-WC`).
- [ ] Every branch within 15 km of Bluewater Bay verified (open, right chain, right pin) and `verified = true`.
- [ ] Every branch within 15 km of Somerset West verified and `verified = true`.
- [ ] Fictional data removed from production: no `TEST …` branches (`source = 'test'`), no seed places (`source = 'seed'`).
- [ ] Branch-report queue (/admin/reports) empty or triaged.
- [ ] Google Places key set with a daily quota, or consciously left off (local search only). *(app works without it — built)*

## Recipes
- [ ] All recipes reviewed for quantities, steps, cook times and tags.
- [ ] Each published recipe cooked at least once by a tester (PRD §11.2), then published in /admin/recipes.
- [ ] At least 60 recipes published, ≥ 70% no-oven, a meat-free option for every protein group.
- [ ] Cost preview checked at one Checkers and one Shoprite pilot branch for every published recipe (no "can't price").

## Prices
- [ ] Fixture prices NOT loaded in production (`pnpm db:seed --production` only).
- [ ] Real prices loaded for every pilot chain (leaflets via /admin/leaflets and/or `pnpm import:prices`).
- [ ] /admin/prices shows ≥ 90% recipe coverage at Checkers and Shoprite, and a fresh price (≤ 7 days) for each pilot chain.
- [ ] Weekly leaflet routine agreed (who uploads, which day) so specials stay fresh.
- [ ] Unmatched queue (/admin/unmatched) worked through.
- [ ] Nightly `current_prices` refresh cron running (`/api/cron/refresh-prices`).

## Language
- [ ] isiXhosa strings in `messages/xh.json` reviewed by a fluent speaker (remove every `TODO:`), including the privacy notice (PRD I18N-2, §15).
- [ ] Afrikaans strings in `messages/af.json` reviewed (I18N-4, Somerset West).
- [ ] Recipe names for the top 20 recipes translated in `recipe_translations` and marked reviewed (I18N-3, optional for launch).

## Privacy (POPIA) and security
- [ ] Privacy notice live at /privacy in English and isiXhosa. *(English built; isiXhosa pending review)*
- [ ] Receipt consent shown on first scan; photos stored in a **private** Vercel Blob store; 30-day delete cron running (`/api/cron/cleanup`). *(built)*
- [ ] Data export and delete tested in production from Settings. *(built)*
- [ ] `ENABLE_WEB_IMPORTERS` is `false` (the app refuses to start otherwise). *(built)* Legal advice obtained before any retailer-website importer is considered (PRD §18 #1).
- [ ] `E2E` is NOT set in Vercel (it enables a test-only mailbox).
- [ ] `AUTH_SECRET`, `CRON_SECRET`, VAPID keys, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, Google OAuth set in Vercel; nothing secret in the repo.
- [ ] `ADMIN_EMAILS` lists only the pilot team.

## Operations
- [ ] Error monitoring on (Sentry DSN or Vercel monitoring) and alerts routed to someone.
- [ ] Neon point-in-time restore / branch backups enabled; a restore rehearsed once.
- [ ] Vercel Cron jobs visible and succeeding (08:00 and 16:00 notifications, 03:00 price refresh, 03:30 cleanup).
- [ ] Claude spend alert set in the Anthropic console; daily caps (10 tweaks, 5 receipts per household) confirmed.
- [ ] Lighthouse (mobile) on /plan: PWA installable, LCP ≤ 2.5 s on throttled 3G, first-load JS ≤ 180 KB gz.
- [ ] Tested on a R1,500-class Android (Chrome) and an iPhone with the PWA installed (push works there only when installed).

## Measurement
- [ ] Pilot dashboard (/admin/pilot) shows events from a test household end to end.
- [ ] Targets written down for the review: activation ≥ 60%, W4 retention ≥ 25%, savings rate ≥ 15%, budget fit ≥ 85%, list ≤ 22 items, receipt price trust ≥ 90% (PRD §5).
