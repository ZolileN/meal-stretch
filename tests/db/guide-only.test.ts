/**
 * Owner decision (MVP): no supper ingredient unpriced. With ONLY the web-search guide prices loaded (no fixture
 * prices), a plan at a shop of every retailer prices every ingredient. Uses its own disposable in-memory DB.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createMigratedPglite } from '@/db/pglite';
import * as schema from '@/db/schema';
import { setDbForTests, type Db } from '@/lib/db';
import { seedAll } from '@/scripts/seed-lib';
import { validateCsv } from '@/lib/prices/csv';
import { importPriceRows } from '@/lib/prices/import';
import { createHousehold } from '@/lib/household';
import { createPlan } from '@/lib/plans/service';
import { testDb } from './helpers';

let pg: PGlite;
let db: Db;

beforeAll(async () => {
  pg = await createMigratedPglite();
  db = drizzle({ client: pg, schema }) as unknown as Db;
  setDbForTests(db);
  await seedAll(db, { testBranches: true, fixturePrices: false, devPublishRecipes: true });
  const { rows, rejected } = validateCsv(readFileSync('seed/prices.guide.csv', 'utf8'), new Date('2100-01-01'));
  expect(rejected).toEqual([]);
  await importPriceRows(db, rows, { source: 'guide' });
}, 120_000);

afterAll(async () => {
  await pg.close();
  await testDb(); // hand the shared test DB back to the other suites
});

describe('guide prices only', () => {
  it.each(['TEST Usave Somerset West', 'TEST SPAR Somerset West', 'TEST Woolworths Food Somerset West', 'TEST Checkers Somerset West', 'TEST Pick n Pay Somerset West'])(
    '%s: a week for 4 people has no unpriced items and a plausible total',
    async (branchName) => {
      const b = await pg.query<{ id: number }>(`select id from branches where name = $1`, [branchName]);
      expect(b.rows[0], branchName).toBeDefined();
      const h = await createHousehold(db, crypto.randomUUID());
      const plan = await createPlan(db, h, {
        household: { light: 0, average: 4, big: 0 }, shops: { mainBranchId: Number(b.rows[0]!.id), topUpBranchId: null }, loyalty: [], days: 7, budgetRands: 1500,
      });
      expect(plan.result.unpriced).toEqual([]);
      expect(plan.result.meals).toHaveLength(7);
      // Plausibility: 28 plates between R10 and R80 each on average.
      expect(plan.result.totals.perPlateCents).toBeGreaterThan(1000);
      expect(plan.result.totals.perPlateCents).toBeLessThan(8000);
      expect(plan.result.basket.every((l) => l.tags.includes('stale'))).toBe(true); // guide prices are always flagged
    },
  );
});
