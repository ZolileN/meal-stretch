/**
 * OpenStreetMap import: supermarket branches + searchable places via Overpass.
 *   pnpm import:osm --tiles ZA-GP ZA-KZN   # whole provinces in ~55 km tiles (recommended; works when Overpass is busy)
 *   pnpm import:osm --tiles --all          # all nine provinces
 *   pnpm import:osm ZA-GP                  # one heavy query per province (often times out on public servers)
 *   pnpm import:osm --pilot                # only 25 km around the two pilot areas
 *   pnpm import:osm --file dump.json --province ZA-EC   # from a saved Overpass response
 *   OVERPASS_URL=… to force one server; otherwise public mirrors are tried in turn with backoff.
 * Idempotent (upsert on osm_id), so a failed run can simply be repeated. Never overwrites name/location of
 * verified branches. Data © OpenStreetMap contributors (ODbL); attribution is shown in the store picker.
 */
import { readFileSync } from 'node:fs';
import {
  matchRetailer,
  overpassAroundQuery,
  overpassQuery,
  overpassTileQuery,
  PILOT_AREAS,
  PROVINCE_BBOX,
  provinceTiles,
  toBranch,
  toPlace,
  type OsmElement,
} from '../lib/location/osm';
import { loadEnvFile, scriptRunner } from './db-runner';

loadEnvFile();
const SERVERS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runOverpassOnce(server: string, query: string): Promise<OsmElement[]> {
  const res = await fetch(server, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'budget-meal-planner-osm-import/0.1' },
    body: 'data=' + encodeURIComponent(query),
    signal: AbortSignal.timeout(150_000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status} at ${new URL(server).host}`);
  const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
  if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(`Overpass: ${json.remark.slice(0, 120)}`);
  return json.elements ?? [];
}

/** Try each server, then back off and go round again (Overpass asks for exponential backoff when busy). */
async function runOverpass(query: string, rounds = 3): Promise<OsmElement[]> {
  let last: unknown;
  for (let round = 0; round < rounds; round++) {
    for (const server of SERVERS) {
      try {
        return await runOverpassOnce(server, query);
      } catch (e) {
        last = e;
      }
    }
    await sleep(10_000 * 2 ** round);
  }
  throw last;
}

type Job = { label: string; iso: string; elements: () => Promise<OsmElement[]> };

function jobsFrom(args: string[]): Job[] {
  const provinces = args.includes('--all') ? Object.keys(PROVINCE_BBOX) : args.filter((a) => /^ZA-[A-Z]{2,3}$/.test(a));
  if (args.includes('--pilot')) return PILOT_AREAS.map((a) => ({ label: a.name, iso: a.iso, elements: () => runOverpass(overpassAroundQuery(a.lat, a.lng, 25_000)) }));
  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0) {
    const iso = args[args.indexOf('--province') + 1] ?? 'ZA-EC';
    return [{ label: `${iso} (file)`, iso, elements: async () => (JSON.parse(readFileSync(args[fileIdx + 1]!, 'utf8')) as { elements: OsmElement[] }).elements }];
  }
  const list = provinces.length ? provinces : ['ZA-EC', 'ZA-WC'];
  if (args.includes('--tiles'))
    return list.flatMap((iso) => {
      const tiles = provinceTiles(iso);
      return tiles.map((t, i) => ({ label: `${iso} tile ${i + 1}/${tiles.length}`, iso, elements: () => runOverpass(overpassTileQuery(iso, t)) }));
    });
  return list.map((iso) => ({ label: iso, iso, elements: () => runOverpass(overpassQuery(iso)) }));
}

async function main() {
  const args = process.argv.slice(2);
  const db = scriptRunner();
  const retailers = (await db.query<{ id: string; name: string }>('select id, name from retailers')).rows;
  const names = Object.fromEntries(retailers.map((r) => [r.id, r.name]));
  const jobs = jobsFrom(args);
  const failed: string[] = [];
  const totals = new Map<string, { b: number; p: number }>();

  for (const job of jobs) {
    let els: OsmElement[];
    try {
      els = await job.elements();
    } catch (e) {
      failed.push(job.label);
      console.log(`${job.label}: FAILED (${(e as Error).message})`);
      continue;
    }
    let nb = 0;
    let np = 0;
    const province = job.iso.slice(3);
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
          [b.retailerId, b.name, b.osmId, b.address, b.suburb, b.city, province, b.lng, b.lat],
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
          [p.name, p.nameNorm, p.kind, p.parentName, province, p.lng, p.lat, p.osmId, p.rank],
        );
        np++;
      }
    }
    const t = totals.get(job.iso) ?? { b: 0, p: 0 };
    totals.set(job.iso, { b: t.b + nb, p: t.p + np });
    console.log(`${job.label}: ${nb} branches, ${np} places upserted`);
  }
  for (const [iso, t] of totals) console.log(`== ${iso}: ${t.b} branches, ${t.p} places`);
  if (failed.length) {
    console.log(`== ${failed.length} job(s) failed; run the same command again (it is safe to repeat): ${failed.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
