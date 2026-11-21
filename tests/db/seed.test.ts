import { describe, expect, it } from 'vitest';
import { seedAll } from '@/scripts/seed-lib';
import { loadIngredients, loadPublishedRecipes } from '@/lib/recipes/queries';
import { seededTestDb } from './helpers';

const counts = async (pg: Awaited<ReturnType<typeof seededTestDb>>['pg']) => {
  const r = await pg.query<Record<string, number>>(`select
    (select count(*)::int from retailers) retailers, (select count(*)::int from branches) branches,
    (select count(*)::int from places) places, (select count(*)::int from ingredients) ingredients,
    (select count(*)::int from recipes) recipes, (select count(*)::int from recipe_ingredients) recipe_ingredients,
    (select count(*)::int from products) products, (select count(*)::int from price_observations) observations,
    (select count(*)::int from product_aliases) aliases`);
  return r.rows[0]!;
};

describe('seed', () => {
  it('is idempotent', async () => {
    const { db, pg } = await seededTestDb();
    const before = await counts(pg);
    await seedAll(db);
    const after = await counts(pg);
    // other test files may add their own rows; the seed itself must add nothing on re-run
    expect(after).toEqual(before);
    expect(before.recipes).toBeGreaterThanOrEqual(60);
  });

  it('every recipe ingredient exists (FK) and published recipes load for the engine', async () => {
    const { db } = await seededTestDb();
    const ings = await loadIngredients(db);
    const recipes = await loadPublishedRecipes(db);
    expect(recipes.length).toBeGreaterThanOrEqual(60);
    for (const r of recipes) for (const i of r.ingredients) expect(ings[i.ingredientId], `${r.id}/${i.ingredientId}`).toBeDefined();
    expect(recipes.find((r) => r.id === 'cabbage_boerewors')?.tags).toEqual(expect.arrayContaining(['contains:beef', 'contains:pork']));
  });
});
