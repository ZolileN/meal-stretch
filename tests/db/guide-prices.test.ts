/** 0006 guide prices: looked-up prices fill gaps (also from another retailer), never beat real prices, 90-day life. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { loadPriceSnapshot } from '@/lib/prices/snapshot';
import { refreshCurrentPrices } from '@/lib/prices/import';
import { createHousehold } from '@/lib/household';
import { createPlan } from '@/lib/plans/service';
import { buildListView } from '@/lib/plans/list';
import { isoDateInSA } from '@/lib/period';
import { costPreview, getRecipe } from '@/lib/admin/recipes';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let usave: number;
let checkers: number;
const asOf = isoDateInSA(new Date());
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function guide(name: string, ingredient: string, packQty: number, price: number, daysAgo: number, retailer = 'checkers') {
  const p = await pg.query<{ id: number }>(
    `insert into products (retailer_id, ingredient_id, name, pack_qty, pack_unit) values ($1, $2, $3, $4, 'g') returning id`,
    [retailer, ingredient, name, packQty],
  );
  const id = Number(p.rows[0]!.id);
  await pg.query(
    `insert into price_observations (product_id, retailer_id, price_cents, source, source_url, observed_at) values ($1, $2, $3, 'guide', 'https://example.org/found', $4)`,
    [id, retailer, price, ago(daysAgo)],
  );
  return id;
}

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  const id = async (n: string) => Number((await pg.query<{ id: number }>(`select id from branches where name = $1`, [n])).rows[0]!.id);
  usave = await id('TEST Usave Somerset West');
  checkers = await id('TEST Checkers Somerset West');
});

describe('guide prices', () => {
  it('fill a gap at a shop of another retailer, using the highest unit price; never beat a real price', async () => {
    const cheap = await guide('TEST Guide Spaghetti 500g', 'pasta', 500, 1500, 30); // 30 days old: still usable as a guide
    const dear = await guide('TEST Guide Spaghetti 1kg', 'pasta', 1000, 4000, 10);
    await guide('TEST Guide Spaghetti ancient', 'pasta', 500, 9000, 120); // older than 90 days: ignored
    await refreshCurrentPrices(db);

    const atUsave = await loadPriceSnapshot(db, { branchIds: [usave], loyalty: [], asOf });
    expect(atUsave.offers.pasta).toEqual([expect.objectContaining({ productId: dear, branchId: usave, source: 'guide', priceCents: 4000 })]);
    expect(atUsave.offers.pasta?.some((o) => o.productId === cheap)).toBe(false);

    // Checkers has real (fixture) pasta prices: its own guide prices are dropped, nothing is borrowed.
    const atCheckers = await loadPriceSnapshot(db, { branchIds: [checkers], loyalty: [], asOf });
    expect(atCheckers.offers.pasta!.length).toBeGreaterThan(0);
    expect(atCheckers.offers.pasta!.every((o) => o.source !== 'guide')).toBe(true);

    // Opt-out (e.g. analysis that must only use real prices).
    const strict = await loadPriceSnapshot(db, { branchIds: [usave], loyalty: [], asOf, guideFallback: false });
    expect(strict.offers.pasta).toBeUndefined();
  });

  it('a pinned pasta supper at Usave is fully priced through the guide price', async () => {
    const recipe = (await getRecipe(db, 'tuna_pasta'))!;
    const preview = await costPreview(db, recipe, usave, 2, asOf);
    expect(preview.unpriced).not.toContain('pasta');
  });

  it('the list flags the line and says where it was looked up', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const plan = await createPlan(db, h, { household: { light: 0, average: 2, big: 0 }, shops: { mainBranchId: usave, topUpBranchId: null }, loyalty: [], days: 7, budgetRands: 900 });
    const pastaProduct = Number((await pg.query<{ id: number }>(`select id from products where name = 'TEST Guide Spaghetti 1kg'`)).rows[0]!.id);
    const withPasta = {
      ...plan,
      result: {
        ...plan.result,
        basket: [...plan.result.basket, { ingredientId: 'pasta', productId: pastaProduct, branchId: usave, packQty: 1000, packs: 1, unitCents: 4000, normalUnitCents: 4000, tags: ['stale' as const], leftoverQty: 0 }],
      },
    };
    const list = await buildListView(db, withPasta);
    const l = list.stores.flatMap((s) => s.aisles.flatMap((a) => a.lines)).find((x) => x.ingredientId === 'pasta')!;
    expect(l).toMatchObject({ source: 'guide', guideRetailer: 'Checkers', sourceUrl: 'https://example.org/found', tags: ['stale'] });
  });
});
