/** Ingredients we can't price yet still appear on the list: tickable, with the amount needed, never in totals. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { createHousehold, householdById } from '@/lib/household';
import { createPlan } from '@/lib/plans/service';
import { putTicks, unpricedKey } from '@/lib/plans/actions';
import { buildListView, whatsappText } from '@/lib/plans/list';
import { buildPlanView } from '@/lib/plans/view';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let usave: number;

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  usave = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Usave Somerset West'`)).rows[0]!.id);
});

describe('unpriced items on the shopping list', () => {
  it('are listed with the amount needed, counted, tickable and shared, but never priced', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const plan = await createPlan(db, h, { household: { light: 0, average: 2, big: 0 }, shops: { mainBranchId: usave, topUpBranchId: null }, loyalty: [], days: 7, budgetRands: 900 });
    expect(plan.result.unpriced.length).toBeGreaterThan(0); // the fictional Usave stocks a small range

    const list = await buildListView(db, plan);
    expect(list.unpriced).toHaveLength(plan.result.unpriced.length);
    expect(list.count).toBe(plan.result.basket.length + plan.result.unpriced.length);
    for (const u of list.unpriced) {
      expect(u.key).toBe(unpricedKey(u.ingredientId));
      expect(u.needed).toMatch(/^\d+(\.\d)?( (g|kg|ml|L))?$/);
    }
    expect(list.totalCents).toBe(plan.result.totals.paidCents); // still excluded from money

    const view = await buildPlanView(db, plan);
    expect(view.listItems).toBe(list.count); // "See shopping list · N items" includes them

    const hh = (await householdById(db, h.id))!;
    const first = list.unpriced[0]!;
    const r = await putTicks(db, hh, plan, [{ key: first.key, ticked: true }, { key: 'unpriced:not_in_plan', ticked: true }]);
    expect(r.applied).toBe(1);
    expect((await buildListView(db, plan)).ticks[first.key]?.ticked).toBe(true);

    const text = whatsappText(list, { header: 'H', at: (s) => s, total: 'T', noPrice: (n, q) => `${n} (${q} needed) · no price yet` });
    expect(text).toContain(`- ${first.name} (${first.needed} needed) · no price yet`);
  });
});
