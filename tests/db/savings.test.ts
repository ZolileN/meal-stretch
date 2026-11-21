import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { createHousehold } from '@/lib/household';
import { createPlan } from '@/lib/plans/service';
import { markShopped } from '@/lib/plans/actions';
import { lifetimeSavings, stealOfTheWeek } from '@/lib/savings';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let checkers: number;
beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  checkers = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Checkers Somerset West'`)).rows[0]!.id);
});

async function receiptEvent(householdId: string, ref: string, cents: number, planId: string | null) {
  await pg.query(
    `insert into savings_events (household_id, kind, ref_id, savings_cents, plan_id) values ($1, 'receipt_verified', $2, $3, $4) on conflict (kind, ref_id) do nothing`,
    [householdId, ref, cents, planId],
  );
}

describe('lifetime savings (SAV-1, SAV-2)', () => {
  it('sums shopped plans, never double counts a verified receipt for the same plan, only goes up', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const plan = await createPlan(db, h, { household: { light: 0, average: 4, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, loyalty: ['xtra_savings'], days: 7 });
    expect((await lifetimeSavings(db, h.id)).totalCents).toBe(0);
    await markShopped(db, h, plan);
    await markShopped(db, h, plan);
    const est = plan.result.totals.savingsCents;
    const a = await lifetimeSavings(db, h.id);
    expect(a.totalCents).toBe(est);
    expect(a.specialsCents + a.memberCents).toBe(est);
    expect(a.shoppedPlans).toBe(1);

    // A smaller verified receipt for the same plan doesn't reduce or add
    await receiptEvent(h.id, 'r1', Math.max(0, est - 100), plan.id);
    expect((await lifetimeSavings(db, h.id)).totalCents).toBe(est);
    // A larger verified amount supersedes the estimate (max), never est + verified
    await receiptEvent(h.id, 'r2', 200, plan.id); // receipts for one plan sum: (est − 100) + 200
    const c = await lifetimeSavings(db, h.id);
    expect(c.totalCents).toBe(Math.max(est, est - 100 + 200));
    // Duplicate receipt event is ignored by unique(kind, ref_id)
    await receiptEvent(h.id, 'r2', 999_999, plan.id);
    expect((await lifetimeSavings(db, h.id)).totalCents).toBe(c.totalCents);
    // An unlinked receipt adds on its own
    await receiptEvent(h.id, 'r3', 500, null);
    expect((await lifetimeSavings(db, h.id)).totalCents).toBe(c.totalCents + 500);
  });
});

describe('steal of the week (SAV-4)', () => {
  it('biggest % special on an ingredient used in ≥ 5 recipes at the household shops', async () => {
    const s = await stealOfTheWeek(db, { branchIds: [checkers], asOf: new Date().toISOString().slice(0, 10) });
    expect(s).not.toBeNull();
    expect(s!.retailerName).toBe('Checkers');
    expect(s!.specialCents).toBeLessThan(s!.normalCents);
    const uses = await pg.query<{ n: number }>(`select count(*)::int n from recipe_ingredients where ingredient_id = $1`, [s!.ingredientId]);
    expect(uses.rows[0]!.n).toBeGreaterThanOrEqual(5);
    expect(s!.lowestInWeeks).toBeNull(); // no 8-week history in fixtures → no claim
  });
  it('no shops → null', async () => expect(await stealOfTheWeek(db, { branchIds: [], asOf: '2026-11-21' })).toBeNull());
});
