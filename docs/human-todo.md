# Human to-do

Format: `- [ ] (Phase N) task: why / exact steps`.

- [ ] (Phase 0) Review the reconstructed CLAUDE.md and PRD.md (converted from the .docx): the originals were not in the repo, so these were rebuilt. Check nothing important is missing.
- [ ] (Phase 0) Confirm the four defaults in docs/decisions.md dated 2026-11-21 (per plate = per serving, savings split, receipt vs plan double counting, local DB): each is a one-line change if you want it the other way.
- [ ] (Phase 0) Optional, for real PostGIS locally: `sudo systemctl enable --now snapd.apparmor && docker compose up -d` (Docker is blocked by AppArmor) or `sudo apt install postgresql-16-postgis-3`. Then set `TEST_DATABASE_URL` to a disposable database.
- [ ] (Phase 0) Create a GitHub repo and `git remote add origin … && git push -u origin main` so CI runs.
