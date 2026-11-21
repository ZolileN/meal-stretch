import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { PlanResult } from '@mealstretch/engine';
import type { Db } from '@/lib/db';
import { createHousehold, householdById, updateHousehold, type Household } from '@/lib/household';
import { createPlan, getPlan, type StoredPlan } from '@/lib/plans/service';
import { alreadyHave, lineKey, markShopped, putTicks, removeMeal, replaceMeal, shouldPromptShopped, swapOptionsFor } from '@/lib/plans/actions';
import { buildListView, whatsappText } from '@/lib/plans/list';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let checkers: number;

function reconciles(r: PlanResult) {
  expect(r.basket.reduce((s, l) => s + l.packs * l.unitCents, 0)).toBe(r.totals.paidCents);
  expect(r.basket.reduce((s, l) => s + l.packs * l.normalUnitCents, 0)).toBe(r.totals.normalCents);
  expect(r.meals.reduce((s, m) => s + m.costCents, 0)).toBe(r.totals.paidCents);
  expect(r.totals.savingsCents).toBe(r.totals.specialsCents + r.totals.memberCents);
}

async function freshPlan(): Promise<{ h: Household; plan: StoredPlan }> {
  const h = await createHousehold(db, crypto.randomUUID());
  const plan = await createPlan(db, h, {
    household: { light: 0, average: 4, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, loyalty: ['xtra_savings'], days: 7, budgetRands: 900,
  });
  return { h: (await householdById(db, h.id))!, plan };
}

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  checkers = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Checkers Somerset West'`)).rows[0]!.id);
});

describe('meal actions keep totals reconciled (BUILD 5.5)', () => {
  it('swap options → choose → cheaper → remove', async () => {
    const { h, plan } = await freshPlan();
    reconciles(plan.result);
    const swap = await swapOptionsFor(db, h, plan, 2);
    expect(swap.options).toHaveLength(3);
    expect(swap.options.every((o) => o.name && Number.isInteger(o.deltaCents))).toBe(true);

    const pick = swap.options[0]!;
    const a = await replaceMeal(db, h, plan, 2, pick.recipeId);
    expect(a.deltaCents).toBe(pick.deltaCents);
    expect(a.plan.result.meals.find((m) => m.day === 2)!.recipeId).toBe(pick.recipeId);
    reconciles(a.plan.result);

    const b = await replaceMeal(db, h, a.plan, 3, 'cheapest');
    expect(b.deltaCents).toBeLessThanOrEqual(0);
    reconciles(b.plan.result);

    const c = await removeMeal(db, h, b.plan, 5);
    expect(c.savedCents).toBe(b.plan.result.totals.paidCents - c.plan.result.totals.paidCents);
    expect(c.plan.result.meals.some((m) => m.day === 5)).toBe(false);
    reconciles(c.plan.result);
    const stored = await getPlan(db, h.id, plan.id);
    expect(stored!.result).toEqual(c.plan.result);
  });

  it('never-swap protein limits swap options to the same protein (PLN-9)', async () => {
    const { h, plan } = await freshPlan();
    const first = await swapOptionsFor(db, h, plan, 1);
    const protein = first.current!.protein!;
    const h2 = await updateHousehold(db, h.id, { neverSwapProteins: [protein.id] });
    const again = await swapOptionsFor(db, h2, plan, 1);
    const tags = await pg.query<{ id: string; tags: string[] }>(`select id, tags from recipes where id = any($1)`, [again.options.map((o) => o.recipeId)]);
    for (const r of tags.rows) expect(r.tags).toContain(`protein:${protein.id}`);
  });

  it('"Already have it" moves the item to the pantry and re-prices (LST-4)', async () => {
    const { h, plan } = await freshPlan();
    const line = plan.result.basket[0]!;
    const r = await alreadyHave(db, h, plan, line.ingredientId);
    expect(r.plan.result.basket.some((l) => l.ingredientId === line.ingredientId)).toBe(false);
    expect(r.savedCents).toBeGreaterThan(0);
    reconciles(r.plan.result);
    const pantry = await pg.query<{ qty: number }>(`select qty from pantry_items where household_id = $1 and ingredient_id = $2`, [h.id, line.ingredientId]);
    expect(Number(pantry.rows[0]!.qty)).toBeGreaterThan(0);
  });

  it('ticks: last write wins, unknown lines ignored (LST-3)', async () => {
    const { h, plan } = await freshPlan();
    const key = lineKey(plan.result.basket[0]!);
    await putTicks(db, h, plan, [{ key, ticked: true, at: '2026-11-21T10:00:00.000Z' }, { key: 'nope:1', ticked: true }]);
    const older = await putTicks(db, h, plan, [{ key, ticked: false, at: '2026-11-21T09:00:00.000Z' }]);
    expect(older.applied).toBe(0);
    expect(older.ticks.find((x) => x.line_key === key)!.ticked).toBe(true);
    const newer = await putTicks(db, h, plan, [{ key, ticked: false, at: '2026-11-21T11:00:00.000Z' }]);
    expect(newer.ticks.find((x) => x.line_key === key)!.ticked).toBe(false);
    expect(newer.ticks.some((x) => x.line_key === 'nope:1')).toBe(false);
  });

  it('mark shopped: one savings event, leftovers into pantry, idempotent (SAV-3)', async () => {
    const { h, plan } = await freshPlan();
    expect(shouldPromptShopped(plan, true, new Date())).toBe(true);
    expect(shouldPromptShopped(plan, false, new Date(Date.parse(plan.createdAt) + 47 * 3600e3))).toBe(false);
    expect(shouldPromptShopped(plan, false, new Date(Date.parse(plan.createdAt) + 48 * 3600e3))).toBe(true);
    expect((await markShopped(db, h, plan)).changed).toBe(true);
    expect((await markShopped(db, h, plan)).changed).toBe(false);
    const ev = await pg.query<{ n: number; s: number }>(`select count(*)::int n, sum(savings_cents)::int s from savings_events where household_id = $1`, [h.id]);
    expect(ev.rows[0]).toEqual({ n: 1, s: plan.result.totals.savingsCents });
    const pantry = await pg.query<{ ingredient_id: string; qty: number }>(`select ingredient_id, qty from pantry_items where household_id = $1 and qty > 0 order by 1`, [h.id]);
    expect(pantry.rows.map((r) => [r.ingredient_id, Number(r.qty)])).toEqual(plan.result.leftovers.filter((l) => l.qty > 0).map((l) => [l.ingredientId, l.qty]));
    const shopped = (await getPlan(db, h.id, plan.id))!;
    expect(shopped.status).toBe('shopped');
    await expect(replaceMeal(db, h, shopped, 1, 'cheapest')).rejects.toThrow(/no longer be changed/);
  });

  it('list view: grouped by store then aisle, source + date on every line, WhatsApp text', async () => {
    const { plan } = await freshPlan();
    const v = await buildListView(db, plan);
    expect(v.count).toBe(plan.result.basket.length);
    expect(v.stores).toHaveLength(1);
    expect(v.stores[0]!.subtotalCents).toBe(plan.result.totals.paidCents);
    const lines = v.stores[0]!.aisles.flatMap((a) => a.lines);
    expect(lines).toHaveLength(v.count);
    for (const l of lines) {
      expect(l.source).toBeTruthy();
      expect(l.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(v.staples.length).toBeGreaterThan(0);
    const text = whatsappText(v, { header: 'List', at: (s) => `At ${s}`, total: 'Total: R1' });
    expect(text).toContain('At Checkers');
    expect(text.split('\n').filter((x) => x.startsWith('- '))).toHaveLength(v.count);
  });
});
