import { describe, expect, it } from 'vitest';
import { createEngine, assignShops, varietyLimits } from '../src/index';
import type { PlanRequest, PlanResult } from '../src/types';
import { BRANCH, context, households, householdContext, recipes, request } from '../fixtures';

const engine = createEngine();
const byId = new Map(recipes.map((r) => [r.id, r]));
const tag = (id: string, prefix: string) => byId.get(id)!.tags.find((t) => t.startsWith(prefix + ':'));

function lineSums(r: PlanResult) {
  return {
    paid: r.basket.reduce((s, l) => s + l.packs * l.unitCents, 0),
    normal: r.basket.reduce((s, l) => s + l.packs * l.normalUnitCents, 0),
    meals: r.meals.reduce((s, m) => s + m.costCents, 0),
  };
}

function assertHardConstraints(req: PlanRequest, r: PlanResult) {
  const ids = r.meals.map((m) => m.recipeId);
  expect(new Set(ids).size, 'no recipe twice').toBe(ids.length);
  const lim = varietyLimits(req.days);
  const count = (prefix: string) => {
    const c = new Map<string, number>();
    for (const id of ids) {
      const v = tag(id, prefix);
      if (v) c.set(v, (c.get(v) ?? 0) + 1);
    }
    return Math.max(0, ...c.values());
  };
  const pinnedIds = new Set(req.pinned.map((p) => p.recipeId));
  if (pinnedIds.size === 0) {
    expect(count('protein'), 'protein limit').toBeLessThanOrEqual(lim.protein);
    expect(count('starch'), 'starch limit').toBeLessThanOrEqual(lim.starch);
  }
  for (const id of ids) {
    const rec = byId.get(id)!;
    if (pinnedIds.has(id)) continue;
    expect(req.blocked).not.toContain(id);
    for (const ex of req.exclusions) expect(rec.tags, `${id} excluded by ${ex}`).not.toContain(`contains:${ex}`);
    if (req.maxCookMinutes !== null) expect(rec.cookMinutes).toBeLessThanOrEqual(req.maxCookMinutes);
  }
  for (const p of req.pinned) expect(r.meals.find((m) => m.day === p.day)?.recipeId).toBe(p.recipeId);
  if (req.mode === 'cheapest') {
    const meatFree = ids.filter((id) => byId.get(id)!.tags.includes('meat_free')).length;
    expect(meatFree, 'meat-free supper in cheapest mode').toBeGreaterThanOrEqual(lim.meatFreeCheapest);
  }
}

describe('plan(): totals, savings, structure', () => {
  const req = households.familyBigEater;
  const r = engine.plan(req, householdContext(req));

  it('fills every day', () => expect(r.meals.map((m) => m.day)).toEqual([1, 2, 3, 4, 5, 6, 7]));

  it('totals = Σ basket lines; meal costs reconcile to paid', () => {
    const s = lineSums(r);
    expect(r.totals.paidCents).toBe(s.paid);
    expect(r.totals.normalCents).toBe(s.normal);
    expect(s.meals).toBe(r.totals.paidCents);
    expect(r.totals.items).toBe(r.basket.length);
  });

  it('savings = normal − paid = specials + member; pack efficiency is separate', () => {
    expect(r.totals.savingsCents).toBe(r.totals.normalCents - r.totals.paidCents);
    expect(r.totals.savingsCents).toBe(r.totals.specialsCents + r.totals.memberCents);
    expect(r.totals.packEfficiencyCents).toBeGreaterThanOrEqual(0);
    expect(r.totals.savingsCents).toBeGreaterThan(0); // fixture has specials at Checkers
  });

  it('per plate = cost / servings (servings 4.0 for this household)', () => {
    for (const m of r.meals) {
      expect(m.servings).toBe(4);
      expect(m.perPlateCents).toBe(Math.round(m.costCents / m.servings));
    }
    expect(r.totals.perPlateCents).toBe(Math.round(r.totals.paidCents / (4 * r.meals.length)));
  });

  it('specials used is reported (PLN-2)', () => {
    expect(r.specialsUsed).toBe(r.basket.filter((l) => l.tags.includes('special')).length);
  });

  it('pantry staples are excluded from totals and the basket (LST-5)', () => {
    expect(r.pantryStaples.length).toBeGreaterThan(0);
    const staples = new Set(r.pantryStaples.map((p) => p.ingredientId));
    expect(r.basket.some((l) => staples.has(l.ingredientId))).toBe(false);
    expect(staples.has('cooking_oil')).toBe(true);
  });

  it('dates start at asOf and include version + seed', () => {
    expect(r.meals[0]!.date).toBe('2026-11-21');
    expect(r.meals[6]!.date).toBe('2026-11-27');
    expect(r.priceAsOf).toBe('2026-11-21');
    expect(r.seed).toBe(req.seed);
    expect(r.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('respects hard constraints', () => assertHardConstraints(req, r));

  it('pack sharing: leftovers computed per ingredient and shared meals flagged (PLN-3)', () => {
    for (const l of r.basket) expect(l.leftoverQty).toBeGreaterThanOrEqual(0);
    expect(r.meals.some((m) => m.sharesWith.length > 0)).toBe(true);
  });
});

describe('variety constraints (PLN-4)', () => {
  it('limits are pro rata', () => {
    expect(varietyLimits(7)).toMatchObject({ protein: 2, starch: 3, meatFreeCheapest: 1 });
    expect(varietyLimits(14)).toMatchObject({ protein: 4, starch: 6, meatFreeCheapest: 2 });
    expect(varietyLimits(3)).toMatchObject({ protein: 1, starch: 2, meatFreeCheapest: 1 });
  });
  it.each([7, 14])('%i days balanced + cheapest', (days) => {
    for (const mode of ['balanced', 'cheapest'] as const) {
      const req = request({ days, household: { light: 0, average: 4, big: 0 }, mode });
      assertHardConstraints(req, engine.plan(req, householdContext(req)));
    }
  });
});

describe('exclusions, blocked, pinned, cook time', () => {
  it('household excluding pork + fish never gets them', () => {
    const req = households.noPorkNoFish;
    assertHardConstraints(req, engine.plan(req, householdContext(req)));
  });
  it('blocked, pinned and maxCookMinutes', () => {
    const req = request({ blocked: ['curry_mince_rice', 'chicken_stew_pap'], pinned: [{ day: 3, recipeId: 'umngqusho' }], maxCookMinutes: 45 });
    const r = engine.plan(req, householdContext(req));
    assertHardConstraints(req, r);
    expect(r.meals.find((m) => m.day === 3)!.recipeId).toBe('umngqusho');
  });
});

describe('pantry deduction (PLN-11)', () => {
  it('pantry stock is consumed before buying, and carried into leftovers', () => {
    const base = request({ days: 7, household: { light: 0, average: 4, big: 0 }, pinned: [{ day: 1, recipeId: 'chicken_stew_pap' }] });
    const r0 = engine.plan(base, householdContext(base));
    expect(r0.basket.some((l) => l.ingredientId === 'maize_meal')).toBe(true);
    const withPantry = { ...base, pantry: [{ ingredientId: 'maize_meal', qty: 20_000 }] };
    const r1 = engine.plan(withPantry, householdContext(withPantry));
    expect(r1.basket.some((l) => l.ingredientId === 'maize_meal')).toBe(false);
    const maizeUsed = r1.meals.length > 0;
    expect(maizeUsed).toBe(true);
    const left = r1.leftovers.find((l) => l.ingredientId === 'maize_meal')!;
    expect(left.qty).toBeGreaterThan(0);
    expect(left.qty).toBeLessThan(20_000);
  });
});

describe('budget handling (§9.6, PLN-5)', () => {
  it('under budget reports remaining', () => {
    const req = request({ budgetCents: 500_000 });
    const r = engine.plan(req, householdContext(req));
    expect(r.budget).toEqual({ budgetCents: 500_000, status: 'under', remainingCents: 500_000 - r.totals.paidCents, shortfallCents: null, maxAffordableDays: null });
  });
  it('no budget → status none', () => {
    const req = request({ budgetCents: null });
    expect(engine.plan(req, householdContext(req)).budget.status).toBe('none');
  });
  it('balanced over budget → over + shortfall; cheapest mode → cheapest plan + maxAffordableDays', () => {
    const tight = request({ household: { light: 0, average: 4, big: 0 }, budgetCents: 30_000 });
    const balanced = engine.plan(tight, householdContext(tight));
    expect(balanced.budget.status).toBe('over');
    expect(balanced.budget.shortfallCents).toBe(balanced.totals.paidCents - 30_000);

    const cheap = { ...tight, mode: 'cheapest' as const };
    const c = engine.plan(cheap, householdContext(cheap));
    expect(c.totals.paidCents).toBeLessThanOrEqual(balanced.totals.paidCents);
    expect(c.budget.status).toBe('over');
    const d = c.budget.maxAffordableDays!;
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThan(7);
    const fits = engine.plan({ ...cheap, days: d }, householdContext(cheap));
    expect(fits.totals.paidCents).toBeLessThanOrEqual(30_000);
  });
});

describe('unpriced handling (PLN-10)', () => {
  it('never estimated; listed with needed qty and recipes; excluded from totals', () => {
    // SPAR fixture has no soya mince or chakalaka; chicken feet only has a >21-day-old price.
    const req = request({ shops: { mainBranchId: BRANCH.spar, topUpBranchId: null }, pinned: [{ day: 1, recipeId: 'soya_mince_bolognaise' }, { day: 2, recipeId: 'chicken_feet_stew_pap' }] });
    const r = engine.plan(req, householdContext(req));
    const soya = r.unpriced.find((u) => u.ingredientId === 'soya_mince')!;
    expect(soya.recipes).toEqual(['soya_mince_bolognaise']);
    expect(soya.neededQty).toBe(30);
    expect(r.unpriced.map((u) => u.ingredientId)).toContain('chicken_feet');
    expect(r.basket.some((l) => l.ingredientId === 'soya_mince' || l.ingredientId === 'chicken_feet')).toBe(false);
    expect(lineSums(r).paid).toBe(r.totals.paidCents);
  });
  it('prefers fully priced recipes when it has a choice', () => {
    const req = request({ shops: { mainBranchId: BRANCH.spar, topUpBranchId: null } });
    const r = engine.plan(req, householdContext(req));
    expect(r.unpriced).toEqual([]);
  });
  it('top-up shop supplies items the main shop cannot price', () => {
    const req = request({ shops: { mainBranchId: BRANCH.spar, topUpBranchId: BRANCH.checkers }, pinned: [{ day: 1, recipeId: 'soya_mince_bolognaise' }] });
    const r = engine.plan(req, householdContext(req));
    expect(r.unpriced).toEqual([]);
    expect(r.basket.find((l) => l.ingredientId === 'soya_mince')!.branchId).toBe(BRANCH.checkers);
  });
});

describe('two-shop split (PLN-12)', () => {
  const line = (id: string, main: number | null, top: number | null) => ({ ingredientId: id, mainCost: main, topUpCost: top });
  it('moves items saving ≥ R5 only when the total split saving ≥ R30', () => {
    expect(assignShops([line('a', 10_000, 7_000), line('b', 5_000, 4_400)])).toEqual({ a: 'topUp', b: 'topUp' }); // R36 total
    expect(assignShops([line('a', 10_000, 6_500), line('b', 5_000, 4_600)])).toEqual({ a: 'topUp', b: 'main' }); // b saves only R4
    expect(assignShops([line('a', 10_000, 9_000), line('b', 5_000, 4_400)])).toEqual({ a: 'main', b: 'main' }); // R16 total < R30
    expect(assignShops([line('a', 10_000, 8_000)])).toEqual({ a: 'main' }); // R20 < R30
    expect(assignShops([line('a', 10_000, 8_000), line('b', 5_000, 3_900)])).toEqual({ a: 'topUp', b: 'topUp' }); // R31
  });
  it('items the main shop cannot price go to the top-up; that trip waives the R30 total', () => {
    expect(assignShops([line('a', null, 8_000), line('b', 100, null)])).toEqual({ a: 'topUp', b: 'main' });
    expect(assignShops([line('a', null, 800), line('b', 5_000, 4_400), line('c', 5_000, 4_700)])).toEqual({ a: 'topUp', b: 'topUp', c: 'main' });
  });
});

describe('determinism (PLN-1)', () => {
  it('same input + seed → deep-equal result', () => {
    for (const req of Object.values(households)) {
      const a = engine.plan(req, householdContext(req));
      const b = engine.plan(structuredClone(req), householdContext(req));
      expect(b).toEqual(a);
    }
  });
});

describe('meal actions (PLN-6…9)', () => {
  const req = households.familyBigEater;
  const ctx = householdContext(req);
  const base = engine.plan(req, ctx);

  it('swapOptions: 3 alternatives with price deltas vs current', () => {
    const opts = engine.swapOptions(req, base, 2, ctx);
    expect(opts).toHaveLength(3);
    for (const o of opts) {
      expect(o.recipeId).not.toBe(base.meals[1]!.recipeId);
      expect(o.deltaCents).toBe(o.result.totals.paidCents - base.totals.paidCents);
      expect(o.result.meals.find((m) => m.day === 2)!.recipeId).toBe(o.recipeId);
      assertHardConstraints(req, o.result);
    }
  });

  it('never-swap protein: alternatives keep the same protein (PLN-9)', () => {
    const day2 = base.meals[1]!.recipeId;
    const protein = tag(day2, 'protein')!.slice('protein:'.length);
    const r2 = { ...req, neverSwapProteins: [protein] };
    const opts = engine.swapOptions(r2, base, 2, ctx);
    for (const o of opts) expect(tag(o.recipeId, 'protein')).toBe(`protein:${protein}`);
  });

  it('replace cheapest ≤ every swap option', () => {
    const cheapest = engine.replace(req, base, 2, 'cheapest', ctx);
    const opts = engine.swapOptions(req, base, 2, ctx);
    for (const o of opts) expect(cheapest.totals.paidCents).toBeLessThanOrEqual(o.result.totals.paidCents);
    assertHardConstraints(req, cheapest);
    const lines = lineSums(cheapest);
    expect(lines.paid).toBe(cheapest.totals.paidCents);
    expect(lines.meals).toBe(cheapest.totals.paidCents);
  });

  it('replace with a specific recipe; refuses one already in the plan', () => {
    const inPlan = new Set(base.meals.map((m) => m.recipeId));
    const pick = recipes.find((x) => !inPlan.has(x.id))!.id;
    const r = engine.replace(req, base, 1, pick, ctx);
    expect(r.meals.find((m) => m.day === 1)!.recipeId).toBe(pick);
    expect(() => engine.replace(req, base, 1, base.meals[2]!.recipeId, ctx)).toThrow(/already in the plan/);
    expect(r.meals.filter((m) => m.day !== 1).map((m) => m.recipeId)).toEqual(base.meals.filter((m) => m.day !== 1).map((m) => m.recipeId));
  });

  it('remove: slot cleared, ingredients used only by it drop off, totals reconcile (PLN-8)', () => {
    const removed = base.meals[0]!;
    const r = engine.remove(req, base, removed.day, ctx);
    expect(r.meals.some((m) => m.day === removed.day)).toBe(false);
    expect(r.meals).toHaveLength(base.meals.length - 1);
    expect(r.totals.paidCents).toBeLessThanOrEqual(base.totals.paidCents);
    const stillUsed = new Set(r.meals.flatMap((m) => byId.get(m.recipeId)!.ingredients.map((i) => i.ingredientId)));
    for (const l of r.basket) expect(stillUsed.has(l.ingredientId)).toBe(true);
    const s = lineSums(r);
    expect([s.paid, s.meals]).toEqual([r.totals.paidCents, r.totals.paidCents]);
  });
});

describe('contexts', () => {
  it('a branch with no offers at all → everything unpriced, totals zero, nothing estimated', () => {
    const req = request({ shops: { mainBranchId: 999, topUpBranchId: null } });
    const r = engine.plan(req, context([999]));
    expect(r.totals.paidCents).toBe(0);
    expect(r.basket).toEqual([]);
    expect(r.unpriced.length).toBeGreaterThan(0);
  });
});

describe('unpriced avoidance with narrow choices', () => {
  it('no-pork/no-fish household at SPAR still gets a fully priced plan', () => {
    const req = households.noPorkNoFish;
    const r = engine.plan(req, householdContext(req));
    expect(r.unpriced).toEqual([]);
  });
});
