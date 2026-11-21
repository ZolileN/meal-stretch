/** A plan made before prices existed is re-planned on the next page load once prices for its gaps arrive. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { createHousehold } from '@/lib/household';
import { createPlan, getPlan, latestPlanFresh } from '@/lib/plans/service';
import { refreshCurrentPrices } from '@/lib/prices/import';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let usave: number;

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  usave = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Usave Somerset West'`)).rows[0]!.id);
});

async function usavePlan() {
  const h = await createHousehold(db, crypto.randomUUID());
  const plan = await createPlan(db, h, { household: { light: 0, average: 2, big: 0 }, shops: { mainBranchId: usave, topUpBranchId: null }, loyalty: [], days: 7, budgetRands: 900 });
  return { h, plan };
}

describe('latestPlanFresh', () => {
  it('leaves a plan alone when no new prices arrived for its gaps', async () => {
    const { h, plan } = await usavePlan();
    expect(plan.result.unpriced.length).toBeGreaterThan(0);
    expect((await latestPlanFresh(db, h.id))!.id).toBe(plan.id);
  });

  it('re-plans once when a price for an unpriced ingredient arrives, then stays put', async () => {
    const { h, plan } = await usavePlan();
    const gap = plan.result.unpriced[0]!.ingredientId;
    const p = await pg.query<{ id: number }>(
      `insert into products (retailer_id, ingredient_id, name, pack_qty, pack_unit) values ('checkers', $1, $2, 1000, (select case unit when 'unit' then 'unit' when 'ml' then 'ml' else 'g' end from ingredients where id = $1)) returning id`,
      [gap, `TEST Late Guide ${gap}`],
    );
    await pg.query(`insert into price_observations (product_id, retailer_id, price_cents, source, observed_at) values ($1, 'checkers', 2500, 'guide', now())`, [p.rows[0]!.id]);
    await refreshCurrentPrices(db);

    const fresh = (await latestPlanFresh(db, h.id))!;
    expect(fresh.id).not.toBe(plan.id);
    expect(fresh.result.unpriced.some((u) => u.ingredientId === gap)).toBe(false);
    expect(fresh.request.household).toEqual(plan.request.household);
    expect(fresh.request.budgetCents).toBe(plan.request.budgetCents);
    expect((await getPlan(db, h.id, plan.id))!.status).toBe('archived');

    expect((await latestPlanFresh(db, h.id))!.id).toBe(fresh.id); // no loop
  });
});
