/**
 * OpenStreetMap import: supermarket branches + searchable places per province via Overpass.
 *   pnpm import:osm                 # ZA-EC and ZA-WC (pilot provinces)
 *   pnpm import:osm ZA-GP           # any province
 *   pnpm import:osm --file dump.json --province ZA-EC   # from a saved Overpass response
 * Idempotent (upsert on osm_id). Never overwrites name/location of branches marked verified.
 * Data © OpenStreetMap contributors (ODbL); attribution is shown in the store picker.
 */
import { readFileSync } from 'node:fs';
import { matchRetailer, overpassQuery, toBranch, toPlace, type OsmElement } from '../lib/location/osm';
import { loadEnvFile, scriptRunner } from './db-runner';

loadEnvFile();
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

async function fetchProvince(iso: string): Promise<OsmElement[]> {
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'budget-meal-planner-osm-import/0.1' },
    body: 'data=' + encodeURIComponent(overpassQuery(iso)),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { elements: OsmElement[] }).elements;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const db = scriptRunner();
  const retailers = (await db.query<{ id: string; name: string }>('select id, name from retailers')).rows;
  const names = Object.fromEntries(retailers.map((r) => [r.id, r.name]));
  const provinces = args.filter((a) => /^ZA-/.test(a));
  const jobs: { iso: string; elements: () => Promise<OsmElement[]> }[] =
    fileIdx >= 0
      ? [{ iso: args[args.indexOf('--province') + 1] ?? 'ZA-EC', elements: async () => (JSON.parse(readFileSync(args[fileIdx + 1]!, 'utf8')) as { elements: OsmElement[] }).elements }]
      : (provinces.length ? provinces : ['ZA-EC', 'ZA-WC']).map((iso) => ({ iso, elements: () => fetchProvince(iso) }));

  for (const job of jobs) {
    const els = await job.elements();
    let nb = 0;
    let np = 0;
    for (const e of els) {
      if (matchRetailer(e.tags)) {
        const b = toBranch(e, names);
        if (!b) continue;
        await db.query(
          `insert into branches (retailer_id, name, osm_id, address, suburb, city, province, geom, source)
           values ($1, $2, $3, $4, $5, $6, $7, st_setsrid(st_makepoint($8, $9), 4326)::geography, 'osm')
           on conflict (osm_id) do update set
             retailer_id = excluded.retailer_id,
             name = case when branches.verified then branches.name else excluded.name end,
             geom = case when branches.verified then branches.geom else excluded.geom end,
             address = coalesce(excluded.address, branches.address), suburb = coalesce(excluded.suburb, branches.suburb),
             city = coalesce(excluded.city, branches.city), province = excluded.province, updated_at = now()`,
          [b.retailerId, b.name, b.osmId, b.address, b.suburb, b.city, job.iso.slice(3), b.lng, b.lat],
        );
        nb++;
      } else {
        const p = toPlace(e);
        if (!p) continue;
        await db.query(
          `insert into places (name, name_norm, kind, parent_name, province, geom, osm_id, source, rank)
           values ($1, $2, $3, $4, $5, st_setsrid(st_makepoint($6, $7), 4326)::geography, $8, 'osm', $9)
           on conflict (osm_id) do update set name = excluded.name, name_norm = excluded.name_norm, kind = excluded.kind,
             parent_name = excluded.parent_name, geom = excluded.geom, rank = excluded.rank`,
          [p.name, p.nameNorm, p.kind, p.parentName, job.iso.slice(3), p.lng, p.lat, p.osmId, p.rank],
        );
        np++;
      }
    }
    console.log(`${job.iso}: ${nb} branches, ${np} places upserted`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
