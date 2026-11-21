import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { createHousehold, householdById } from '@/lib/household';
import { createPlan } from '@/lib/plans/service';
import { ideasFor, replaceMeal } from '@/lib/plans/actions';
import { draftRecipes } from '@/lib/admin/drafts';
import { getRecipe } from '@/lib/admin/recipes';
import type { ExclusionTag } from '@/lib/recipes/tags';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let checkers: number;
const saved = process.env.ANTHROPIC_API_KEY;

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  process.env.ANTHROPIC_API_KEY = ''; // fixture mode: deterministic keyword fallback
  resetEnvCache();
  checkers = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Checkers Somerset West'`)).rows[0]!.id);
});
afterAll(() => {
  process.env.ANTHROPIC_API_KEY = saved;
  resetEnvCache();
});

async function planWith(exclusions: ExclusionTag[] = []) {
  const h = await createHousehold(db, crypto.randomUUID());
  const plan = await createPlan(db, h, {
    household: { light: 0, average: 2, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, loyalty: [], days: 7, budgetRands: 900, exclusions,
  });
  return { h: (await householdById(db, h.id))!, plan };
}

describe('meal ideas (fixture mode)', () => {
  it('returns priced recipes from the catalogue that are not already in the plan', async () => {
    const { h, plan } = await planWith();
    const r = await ideasFor(db, h, plan, 2, 'something quick with chicken');
    expect(r.understood).toBe(true);
    expect(r.options.length).toBeGreaterThan(0);
    expect(r.options.length).toBeLessThanOrEqual(5);
    const inPlan = new Set(plan.result.meals.map((m) => m.recipeId));
    for (const o of r.options) {
      expect(inPlan.has(o.recipeId)).toBe(false);
      expect(o.cookMinutes).toBeLessThanOrEqual(30);
      expect(Number.isInteger(o.perPlateCents) && o.perPlateCents > 0).toBe(true);
      expect(Number.isInteger(o.deltaCents)).toBe(true);
    }
    expect(r.options.map((o) => o.deltaCents)).toEqual([...r.options.map((o) => o.deltaCents)].sort((a, b) => a - b)); // cheapest extra first
    // Choosing an idea is a normal replace, and the delta shown is the delta applied.
    const pick = r.options[0]!;
    const applied = await replaceMeal(db, h, plan, 2, pick.recipeId);
    expect(applied.deltaCents).toBe(pick.deltaCents);
    expect(applied.plan.result.meals.find((m) => m.day === 2)!.recipeId).toBe(pick.recipeId);
  });

  it('never suggests what the household avoids', async () => {
    const { h, plan } = await planWith(['pork', 'fish']);
    const r = await ideasFor(db, h, plan, 1, 'sausages or fish please');
    const tags = await pg.query<{ id: string; tags: string[] }>(`select id, tags from recipes where id = any($1)`, [r.options.map((o) => o.recipeId)]);
    for (const row of tags.rows) expect(row.tags.some((t) => t === 'contains:pork' || t === 'contains:fish')).toBe(false);
  });

  it('not understood for unrelated text', async () => {
    const { h, plan } = await planWith();
    expect(await ideasFor(db, h, plan, 1, 'what is the weather like')).toMatchObject({ understood: false, options: [] });
  });
});

describe('admin recipe drafts', () => {
  it('saves valid drafts unpublished with derived tags; rejects unknown ingredients', async () => {
    const draft = (name: string, ingredient: string) => ({
      name, description: 'A test draft.', cook_minutes: 20, cuisine: 'greek', protein: 'feta_cheese', starch: 'pasta', flags: ['no_oven', 'meat_free'],
      steps: ['Boil the pasta.', 'Make the sauce.', 'Toss together.'],
      ingredients: [{ id: 'pasta', qty_per_serving: 90 }, { id: ingredient, qty_per_serving: 40 }, { id: 'tinned_tomatoes', qty_per_serving: 100 }],
    });
    const r = await draftRecipes(db, 'quick Greek pasta', 2, { fixtureFallback: () => ({ recipes: [draft('Feta pasta for testing', 'feta_cheese'), draft('Dragon fruit pasta', 'dragon_fruit')] }) });
    expect(r.saved).toEqual(['feta_pasta_for_testing']);
    expect(r.rejected).toEqual([expect.objectContaining({ name: 'Dragon fruit pasta' })]);
    const saved = await getRecipe(db, 'feta_pasta_for_testing');
    expect(saved).toMatchObject({ published: false, cookMinutes: 20 });
    expect(saved!.tags).toEqual(expect.arrayContaining(['protein:feta_cheese', 'starch:pasta', 'cuisine:greek', 'meat_free']));
    const stored = await pg.query<{ tags: string[] }>(`select tags from recipes where id = 'feta_pasta_for_testing'`);
    expect(stored.rows[0]!.tags).toEqual(expect.arrayContaining(['contains:dairy', 'contains:gluten']));

    // Same brief again: a new id, never overwriting the first draft.
    const again = await draftRecipes(db, 'quick Greek pasta again', 1, { fixtureFallback: () => ({ recipes: [draft('Feta pasta for testing', 'feta_cheese')] }) });
    expect(again.saved).toEqual(['feta_pasta_for_testing_2']);
  });
});
