import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { createHousehold, householdById } from '@/lib/household';
import { createPlan, getPlan, latestPlan, PlanError } from '@/lib/plans/service';
import { buildPlanView } from '@/lib/plans/view';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let checkers: number;
beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  checkers = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Checkers Somerset West'`)).rows[0]!.id);
});

describe('plans service (POST /api/plans)', () => {
  it('stores request, result, engine version, seed; persists the profile on the household', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const p = await createPlan(db, h, {
      household: { light: 1, average: 2, big: 1 }, shops: { mainBranchId: checkers, topUpBranchId: null },
      loyalty: ['xtra_savings'], exclusions: ['pork'], period: { kind: 'week' }, budgetRands: 900,
    }, new Date('2026-11-21T08:00:00Z'));
    expect(p.status).toBe('active');
    expect(p.request).toMatchObject({ days: 7, budgetCents: 90_000, loyalty: ['xtra_savings'], exclusions: ['pork'], household: { light: 1, average: 2, big: 1 } });
    expect(p.result.engineVersion).toMatch(/^\d/);
    expect(p.result.seed).toBe(p.request.seed);
    const row = await pg.query<{ engine_version: string; seed: number; paid_cents: number }>('select engine_version, seed, paid_cents from plans where id = $1', [p.id]);
    expect(row.rows[0]).toMatchObject({ engine_version: p.result.engineVersion, seed: p.request.seed, paid_cents: p.result.totals.paidCents });
    const saved = await householdById(db, h.id);
    expect(saved).toMatchObject({ light: 1, average: 2, big: 1, loyalty: ['xtra_savings'], exclusions: ['pork'], mainBranchId: checkers });
  });

  it('re-run from a plan ("Fit my budget") keeps days, budget and seed; archives the previous plan', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const a = await createPlan(db, h, { household: { light: 0, average: 1, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, days: 7, budgetRands: 250 });
    expect(a.result.budget.status).toBe('over');
    const b = await createPlan(db, h, { fromPlanId: a.id, mode: 'cheapest' });
    expect(b.request).toMatchObject({ days: 7, budgetCents: 25_000, seed: a.request.seed, mode: 'cheapest' });
    expect(b.result.budget.maxAffordableDays).not.toBeNull();
    expect((await getPlan(db, h.id, a.id))!.status).toBe('archived');
    expect((await latestPlan(db, h.id))!.id).toBe(b.id);
  });

  it('refuses without shops; plans are private to their household', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    await expect(createPlan(db, h, { days: 7 })).rejects.toBeInstanceOf(PlanError);
    const other = await createHousehold(db, crypto.randomUUID());
    const p = await createPlan(db, h, { shops: { mainBranchId: checkers, topUpBranchId: null }, days: 3 });
    expect(await getPlan(db, other.id, p.id)).toBeNull();
  });

  it('builds the P1 view with names, store totals and price date', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const p = await createPlan(db, h, { household: { light: 0, average: 4, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, days: 7, budgetRands: 800 });
    const v = await buildPlanView(db, p);
    expect(v.meals).toHaveLength(7);
    expect(v.meals.every((m) => m.name && !m.name.includes('_'))).toBe(true);
    expect(v.stores[0]).toMatchObject({ branchId: checkers, retailerName: 'Checkers', paidCents: p.result.totals.paidCents });
    expect(v.newestPriceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(v.listItems).toBe(p.result.basket.length);
  });
});
