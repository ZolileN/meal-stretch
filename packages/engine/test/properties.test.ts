import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createEngine, varietyLimits } from '../src/index';
import type { PlanRequest } from '../src/types';
import { BRANCH, context, recipes } from '../fixtures';

const engine = createEngine();
const byId = new Map(recipes.map((r) => [r.id, r]));
const branches = Object.values(BRANCH);

const reqArb: fc.Arbitrary<PlanRequest> = fc
  .record({
    days: fc.integer({ min: 3, max: 14 }),
    light: fc.integer({ min: 0, max: 4 }),
    average: fc.integer({ min: 0, max: 6 }),
    big: fc.integer({ min: 0, max: 3 }),
    budget: fc.option(fc.integer({ min: 5_000, max: 300_000 }), { nil: null }),
    main: fc.constantFrom(...branches),
    topUp: fc.option(fc.constantFrom(...branches), { nil: null }),
    loyalty: fc.subarray(['xtra_savings', 'smart_shopper', 'spar_rewards']),
    exclusions: fc.subarray(['pork', 'beef', 'fish', 'dairy'], { maxLength: 2 }),
    mode: fc.constantFrom('balanced' as const, 'cheapest' as const),
    maxCook: fc.option(fc.constantFrom(45, 60, 90), { nil: null }),
    pantry: fc.array(fc.record({ ingredientId: fc.constantFrom('maize_meal', 'rice', 'onion', 'eggs', 'cooking_oil'), qty: fc.integer({ min: 1, max: 3000 }) }), { maxLength: 3 }),
    seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  })
  .filter((r) => r.light + r.average + r.big > 0)
  .map((r) => ({
    days: r.days,
    household: { light: r.light, average: r.average, big: r.big },
    budgetCents: r.budget,
    shops: { mainBranchId: r.main, topUpBranchId: r.topUp === r.main ? null : r.topUp },
    loyalty: r.loyalty,
    exclusions: r.exclusions,
    neverSwapProteins: [],
    pantry: r.pantry,
    pinned: [],
    blocked: [],
    mode: r.mode,
    maxCookMinutes: r.maxCook,
    seed: r.seed,
  }));

describe('engine properties (fast-check)', () => {
  it('totals = Σ lines; savings ≥ 0; paid ≤ normal; no hard constraint violated; < 300 ms', () => {
    fc.assert(
      fc.property(reqArb, (req) => {
        const ids = [req.shops.mainBranchId, ...(req.shops.topUpBranchId ? [req.shops.topUpBranchId] : [])];
        const ctx = context(ids, req.loyalty);
        const t0 = performance.now();
        const r = engine.plan(req, ctx);
        const ms = performance.now() - t0;
        const paid = r.basket.reduce((s, l) => s + l.packs * l.unitCents, 0);
        const normal = r.basket.reduce((s, l) => s + l.packs * l.normalUnitCents, 0);
        expect(r.totals.paidCents).toBe(paid);
        expect(r.totals.normalCents).toBe(normal);
        expect(r.meals.reduce((s, m) => s + m.costCents, 0)).toBe(paid);
        expect(r.totals.savingsCents).toBeGreaterThanOrEqual(0);
        expect(r.totals.paidCents).toBeLessThanOrEqual(r.totals.normalCents);
        expect(r.totals.specialsCents + r.totals.memberCents).toBe(r.totals.savingsCents);
        for (const l of r.basket) {
          expect(Number.isInteger(l.unitCents) && Number.isInteger(l.packs) && l.packs > 0).toBe(true);
          expect(ids).toContain(l.branchId);
          expect(l.unitCents).toBeLessThanOrEqual(l.normalUnitCents);
        }
        const used = r.meals.map((m) => m.recipeId);
        expect(new Set(used).size).toBe(used.length);
        expect(r.meals.length).toBe(req.days);
        const lim = varietyLimits(req.days);
        const counts = (p: string) => {
          const c = new Map<string, number>();
          for (const id of used) {
            const v = byId.get(id)!.tags.find((t) => t.startsWith(p));
            if (v) c.set(v, (c.get(v) ?? 0) + 1);
          }
          return Math.max(0, ...c.values());
        };
        expect(counts('protein:')).toBeLessThanOrEqual(lim.protein);
        expect(counts('starch:')).toBeLessThanOrEqual(lim.starch);
        for (const id of used) {
          const rec = byId.get(id)!;
          for (const ex of req.exclusions) expect(rec.tags).not.toContain(`contains:${ex}`);
          if (req.maxCookMinutes !== null) expect(rec.cookMinutes).toBeLessThanOrEqual(req.maxCookMinutes);
        }
        if (req.mode === 'cheapest') expect(used.filter((id) => byId.get(id)!.tags.includes('meat_free')).length).toBeGreaterThanOrEqual(lim.meatFreeCheapest);
        if (r.budget.status === 'under') expect(r.totals.paidCents).toBeLessThanOrEqual(req.budgetCents!);
        if (r.budget.status === 'over') expect(r.budget.shortfallCents).toBe(r.totals.paidCents - req.budgetCents!);
        expect(ms).toBeLessThan(300);
      }),
      { numRuns: 60, seed: 20261121 },
    );
  });
});
