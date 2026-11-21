import { describe, expect, it } from 'vitest';
import { applyTweak, keywordTweak, tweakSchema } from '@/lib/plans/tweak';
import type { PlanRequest } from '@mealstretch/engine';

const req: PlanRequest = {
  days: 7, household: { light: 0, average: 2, big: 0 }, budgetCents: 60000, shops: { mainBranchId: 1, topUpBranchId: null }, loyalty: [],
  exclusions: ['pork'], neverSwapProteins: [], pantry: [], pinned: [{ day: 1, recipeId: 'x' }], blocked: [], mode: 'balanced', maxCookMinutes: null, seed: 1,
};

describe('tweak patch (PLN-13)', () => {
  it('Zod rejects anything outside the contract (no prices, no recipes)', () => {
    expect(tweakSchema.safeParse({ understood: true, add_exclusions: ['chicken'] }).success).toBe(false);
    expect(tweakSchema.safeParse({ understood: true, max_cook_minutes: 5 }).success).toBe(false);
    expect(tweakSchema.safeParse({ understood: true, days: 30 }).success).toBe(false);
    expect(tweakSchema.safeParse({ understood: true, price_cents: 100 }).success).toBe(false);
    expect(tweakSchema.safeParse({ understood: true, recipes: ['curry'] }).success).toBe(false);
    expect(tweakSchema.parse({ understood: true })).toMatchObject({ add_exclusions: [], mode: null, days: null });
  });
  it('keyword fixture parser', () => {
    expect(keywordTweak('No fish this week and quicker meals')).toMatchObject({ understood: true, add_exclusions: ['fish'], max_cook_minutes: 30 });
    expect(keywordTweak('make it cheaper please, 5 days')).toMatchObject({ mode: 'cheapest', days: 5 });
    expect(keywordTweak('meals under 45 min')).toMatchObject({ max_cook_minutes: 45 });
    expect(keywordTweak('what is the weather').understood).toBe(false);
  });
  it('applies to a request without touching money fields', () => {
    const r = applyTweak(req, { understood: true, add_exclusions: ['fish'], remove_exclusions: ['pork'], max_cook_minutes: 30, clear_max_cook: false, mode: 'cheapest', days: 5 });
    expect(r).toMatchObject({ exclusions: ['fish'], maxCookMinutes: 30, mode: 'cheapest', days: 5, budgetCents: 60000, pinned: [] });
    expect(applyTweak(r, { understood: true, add_exclusions: [], remove_exclusions: [], max_cook_minutes: null, clear_max_cook: true, mode: null, days: null }).maxCookMinutes).toBeNull();
  });
});
