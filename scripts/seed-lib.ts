/**
 * Idempotent seed loaders shared by `pnpm db:seed`, the local DB and integration tests.
 * Only parameterised SQL.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normName } from '../lib/location/normalize';

export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface SeedOptions {
  log?: (msg: string) => void;
  /** Include fictional TEST branches (dev/test only). Default true. */
  testBranches?: boolean;
  /** Include fictional fixture prices (dev/test only). Default true. */
  fixturePrices?: boolean;
}

const root = process.cwd();
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T;

export { normName };

export async function seedRetailers(db: SqlRunner) {
  const rows = readJson<{ id: string; name: string; loyaltyProgramId: string | null; loyaltyProgramName: string | null }[]>(
    'seed/retailers.json',
  );
  for (const r of rows) {
    await db.query(
      `insert into retailers (id, name, loyalty_program_id, loyalty_program_name) values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, loyalty_program_id = excluded.loyalty_program_id,
         loyalty_program_name = excluded.loyalty_program_name`,
      [r.id, r.name, r.loyaltyProgramId, r.loyaltyProgramName],
    );
  }
  return rows.length;
}

export async function seedPlaces(db: SqlRunner) {
  const { places } = readJson<{
    places: { key: string; name: string; kind: string; parent: string; province: string; lat: number; lng: number; rank: number }[];
  }>('seed/places.seed.json');
  for (const p of places) {
    await db.query(
      `insert into places (name, name_norm, kind, parent_name, province, geom, osm_id, source, rank)
       values ($1, $2, $3, $4, $5, st_setsrid(st_makepoint($6, $7), 4326)::geography, $8, 'seed', $9)
       on conflict (osm_id) do update set name = excluded.name, name_norm = excluded.name_norm, kind = excluded.kind,
         parent_name = excluded.parent_name, province = excluded.province, geom = excluded.geom, rank = excluded.rank`,
      [p.name, normName(p.name), p.kind, p.parent, p.province, p.lng, p.lat, `seed/${p.key}`, p.rank],
    );
  }
  return places.length;
}

export async function seedTestBranches(db: SqlRunner) {
  const { branches } = readJson<{
    branches: { key: string; retailerId: string; name: string; suburb: string; city: string; province: string; lat: number; lng: number }[];
  }>('seed/test-branches.json');
  for (const b of branches) {
    if (!b.name.startsWith('TEST ')) throw new Error(`test branch ${b.key} must be named "TEST …"`);
    await db.query(
      `insert into branches (retailer_id, name, osm_id, suburb, city, province, geom, verified, source)
       values ($1, $2, $3, $4, $5, $6, st_setsrid(st_makepoint($7, $8), 4326)::geography, false, 'test')
       on conflict (osm_id) do update set retailer_id = excluded.retailer_id, name = excluded.name, suburb = excluded.suburb,
         city = excluded.city, province = excluded.province, geom = excluded.geom, updated_at = now()`,
      [b.retailerId, b.name, `test/${b.key}`, b.suburb, b.city, b.province, b.lng, b.lat],
    );
  }
  return branches.length;
}

/** Later phases register more loaders here (ingredients, recipes, fixture prices). */
export const extraSeeders: { name: string; run: (db: SqlRunner, opts: SeedOptions) => Promise<number> }[] = [];

export async function seedAll(db: SqlRunner, opts: SeedOptions = {}) {
  const log = opts.log ?? (() => {});
  log(`seeded ${await seedRetailers(db)} retailers`);
  log(`seeded ${await seedPlaces(db)} places`);
  if (opts.testBranches !== false) log(`seeded ${await seedTestBranches(db)} TEST branches`);
  for (const s of extraSeeders) log(`seeded ${await s.run(db, opts)} ${s.name}`);
}

export const seedFileExists = (rel: string) => existsSync(join(root, rel));
