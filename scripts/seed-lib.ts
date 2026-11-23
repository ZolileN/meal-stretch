/**
 * Idempotent seed loaders shared by `pnpm db:seed`, the local DB and integration tests.
 * Parameterised SQL only (Drizzle sql template).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Db } from '../lib/db';
import { normName } from '../lib/location/normalize';
import { validateCsv } from '../lib/prices/csv';
import { importPriceRows } from '../lib/prices/import';
import { deriveTags } from '../lib/recipes/tags';

export { normName };

export interface SeedOptions {
  log?: (msg: string) => void;
  /** Fictional TEST branches (dev/test only). Default true. */
  testBranches?: boolean;
  /**
   * Approximate dev/test place centres (seed/places.seed.json). Default true. Production skips them:
   * the OpenStreetMap import supplies real places, and re-seeding would bring deleted ones back.
   */
  seedPlaces?: boolean;
  /** Fictional fixture prices (dev/test only). Default true. */
  fixturePrices?: boolean;
  /**
   * Publish all recipes so the planner has something to plan with in dev/tests. Never in production:
   * recipes are published only after a human cook-test (PRD §11.2). Default: same as fixturePrices.
   */
  devPublishRecipes?: boolean;
  /** "Today" for rebasing fixture price dates (tests). */
  today?: Date;
}

const root = process.cwd();
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T;

export interface SeedIngredient {
  id: string;
  name: string;
  unit: 'g' | 'ml' | 'unit';
  roundTo: number;
  perishable: boolean;
  pantryStaple: boolean;
  category: string;
}
export interface SeedRecipe {
  id: string;
  name: string;
  description: string;
  cookMinutes: number;
  tags: string[];
  steps: string[];
  ingredients: { id: string; qty: number; optional?: boolean }[];
  published: boolean;
}

export const loadSeedIngredients = () => readJson<SeedIngredient[]>('seed/ingredients.sample.json');
export const loadSeedRecipes = (): SeedRecipe[] => [
  ...readJson<{ recipes: SeedRecipe[] }>('seed/recipes.sample.json').recipes,
  ...readJson<{ recipes: SeedRecipe[] }>('seed/recipes.draft.json').recipes,
];

export async function seedRetailers(db: Db) {
  const rows = readJson<{ id: string; name: string; loyaltyProgramId: string | null; loyaltyProgramName: string | null }[]>('seed/retailers.json');
  for (const r of rows) {
    await db.execute(sql`insert into retailers (id, name, loyalty_program_id, loyalty_program_name)
      values (${r.id}, ${r.name}, ${r.loyaltyProgramId}, ${r.loyaltyProgramName})
      on conflict (id) do update set name = excluded.name, loyalty_program_id = excluded.loyalty_program_id,
        loyalty_program_name = excluded.loyalty_program_name`);
  }
  return rows.length;
}

export async function seedPlaces(db: Db) {
  const { places } = readJson<{ places: { key: string; name: string; kind: string; parent: string; province: string; lat: number; lng: number; rank: number }[] }>(
    'seed/places.seed.json',
  );
  for (const p of places) {
    await db.execute(sql`insert into places (name, name_norm, kind, parent_name, province, geom, osm_id, source, rank)
      values (${p.name}, ${normName(p.name)}, ${p.kind}, ${p.parent}, ${p.province},
              st_setsrid(st_makepoint(${p.lng}, ${p.lat}), 4326)::geography, ${`seed/${p.key}`}, 'seed', ${p.rank})
      on conflict (osm_id) do update set name = excluded.name, name_norm = excluded.name_norm, kind = excluded.kind,
        parent_name = excluded.parent_name, province = excluded.province, geom = excluded.geom, rank = excluded.rank`);
  }
  return places.length;
}

export async function seedTestBranches(db: Db) {
  const { branches } = readJson<{ branches: { key: string; retailerId: string; name: string; suburb: string; city: string; province: string; lat: number; lng: number }[] }>(
    'seed/test-branches.json',
  );
  for (const b of branches) {
    if (!b.name.startsWith('TEST ')) throw new Error(`test branch ${b.key} must be named "TEST …"`);
    await db.execute(sql`insert into branches (retailer_id, name, osm_id, suburb, city, province, geom, verified, source)
      values (${b.retailerId}, ${b.name}, ${`test/${b.key}`}, ${b.suburb}, ${b.city}, ${b.province},
              st_setsrid(st_makepoint(${b.lng}, ${b.lat}), 4326)::geography, false, 'test')
      on conflict (osm_id) do update set retailer_id = excluded.retailer_id, name = excluded.name, suburb = excluded.suburb,
        city = excluded.city, province = excluded.province, geom = excluded.geom, updated_at = now()`);
  }
  return branches.length;
}

export async function seedIngredients(db: Db) {
  const rows = loadSeedIngredients();
  for (const i of rows) {
    await db.execute(sql`insert into ingredients (id, name, unit, round_to, perishable, pantry_staple, category)
      values (${i.id}, ${i.name}, ${i.unit}, ${i.roundTo}, ${i.perishable}, ${i.pantryStaple}, ${i.category})
      on conflict (id) do update set name = excluded.name, unit = excluded.unit, round_to = excluded.round_to,
        perishable = excluded.perishable, pantry_staple = excluded.pantry_staple, category = excluded.category`);
  }
  return rows.length;
}

export async function seedRecipes(db: Db, opts: { devPublish: boolean }) {
  const cats = new Map(loadSeedIngredients().map((i) => [i.id, i.category]));
  const recipes = loadSeedRecipes();
  for (const r of recipes) {
    const tags = deriveTags(r.tags, r.ingredients.map((i) => i.id), (id) => cats.get(id));
    const published = r.published || opts.devPublish;
    // Never un-publish a recipe an admin published; dev-publish only affects local/test databases.
    await db.execute(sql`insert into recipes (id, name, description, cook_minutes, steps, tags, published)
      values (${r.id}, ${r.name}, ${r.description}, ${r.cookMinutes}, ${JSON.stringify(r.steps)}::jsonb, ${`{${tags.join(',')}}`}::text[], ${published})
      on conflict (id) do update set name = excluded.name, description = excluded.description, cook_minutes = excluded.cook_minutes,
        steps = excluded.steps, tags = excluded.tags, published = recipes.published or excluded.published, updated_at = now()`);
    await db.execute(sql`delete from recipe_ingredients where recipe_id = ${r.id}`);
    for (const i of r.ingredients) {
      await db.execute(sql`insert into recipe_ingredients (recipe_id, ingredient_id, qty_per_serving, optional)
        values (${r.id}, ${i.id}, ${i.qty}, ${i.optional ?? false})`);
    }
  }
  return recipes.length;
}

/** Fictional fixture prices, rebased so the newest row is "yesterday". */
export async function seedFixturePrices(db: Db, today = new Date()) {
  const text = readFileSync(join(root, 'seed/prices.fixture.csv'), 'utf8');
  const { rows, rejected } = validateCsv(text, new Date('2100-01-01'));
  if (rejected.length) throw new Error(`fixture CSV has invalid rows: ${JSON.stringify(rejected.slice(0, 3))}`);
  const newest = Math.max(...rows.map((r) => new Date(r.observed_at).getTime()));
  const yesterday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 86_400_000;
  const shiftDays = Math.round((yesterday - newest) / 86_400_000);
  // Rebase dates; skip work when this exact shift was already loaded (idempotent).
  const res = await importPriceRows(db, rows, { source: 'catalogue', kind: 'csv', shiftDays });
  return res.observationsCreated;
}

export async function seedAll(db: Db, opts: SeedOptions = {}) {
  const log = opts.log ?? (() => {});
  const fixtures = opts.fixturePrices !== false;
  log(`seeded ${await seedRetailers(db)} retailers`);
  if (opts.seedPlaces !== false) log(`seeded ${await seedPlaces(db)} places`);
  if (opts.testBranches !== false) log(`seeded ${await seedTestBranches(db)} TEST branches`);
  log(`seeded ${await seedIngredients(db)} ingredients`);
  log(`seeded ${await seedRecipes(db, { devPublish: opts.devPublishRecipes ?? fixtures })} recipes`);
  if (fixtures) log(`seeded ${await seedFixturePrices(db, opts.today)} FICTIONAL fixture price observations`);
}
