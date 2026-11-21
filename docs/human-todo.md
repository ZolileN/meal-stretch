# Human to-do

Format: `- [ ] (Phase N) task: why / exact steps`.

- [ ] (Phase 0) Review the reconstructed CLAUDE.md and PRD.md (converted from the .docx): the originals were not in the repo, so these were rebuilt. Check nothing important is missing.
- [ ] (Phase 0) Confirm the four defaults in docs/decisions.md dated 2026-11-21 (per plate = per serving, savings split, receipt vs plan double counting, local DB): each is a one-line change if you want it the other way.
- [ ] (Phase 0) Optional, for real PostGIS locally: `sudo systemctl enable --now snapd.apparmor && docker compose up -d` (Docker is blocked by AppArmor) or `sudo apt install postgresql-16-postgis-3`. Then set `TEST_DATABASE_URL` to a disposable database.
- [ ] (Phase 0) Create a GitHub repo and `git remote add origin … && git push -u origin main` so CI runs.
- [ ] (Phase 1) Import real stores + places from OpenStreetMap into Neon: the app ships with only fictional `TEST …` branches. Steps: set `DATABASE_URL` (Neon, empty `DATABASE_HTTP_ENDPOINT`) in `.env.local`, then `pnpm db:migrate && pnpm db:seed --production && pnpm import:osm ZA-EC ZA-WC`. If Overpass times out, save the JSON from https://overpass-turbo.eu (query printed by `overpassQuery()` in lib/location/osm.ts) and run `pnpm import:osm --file ec.json --province ZA-EC`.
- [ ] (Phase 1) Manually verify every branch within 15 km of Bluewater Bay and Somerset West (PRD §17 Phase 1): check each is open and correctly placed, then `update branches set verified = true where id in (…)`. Accept/reject branch reports in /admin (Phase 8).
- [ ] (Phase 1) Delete fictional data before launch: `delete from branches where source = 'test'; delete from places where source = 'seed';` (only after the OSM import).
- [ ] (Phase 1) Optional: Google Places key (`GOOGLE_PLACES_API_KEY`) for street-address search; enable only "Places API (New)" and set a daily quota.
