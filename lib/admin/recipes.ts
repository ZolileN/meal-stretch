/** ADM-4 recipe editor: CRUD recipes + ingredients, publish flag, cost preview at a chosen branch. */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createEngine, type EngineRecipe } from '@mealstretch/engine';
import { query, type Db } from '@/lib/db';
import { deriveTags } from '@/lib/recipes/tags';
import { loadIngredients } from '@/lib/recipes/queries';
import { loadPriceSnapshot } from '@/lib/prices/snapshot';
import { invalidateCatalogue } from '@/lib/plans/service';

export const recipeInput = z.object({
  id: z.string().regex(/^[a-z0-9_]{3,80}$/, 'lowercase letters, digits and _'),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(300).nullable(),
  cookMinutes: z.number().int().min(5).max(300),
  tags: z.array(z.string().regex(/^[a-z_]+(:[a-z0-9_]+)?$/)).max(20),
  steps: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  ingredients: z.array(z.object({ ingredientId: z.string().regex(/^[a-z0-9_]{2,60}$/), qtyPerServing: z.number().int().positive().max(5000), optional: z.boolean() })).min(1).max(30),
  published: z.boolean(),
});
export type RecipeInput = z.infer<typeof recipeInput>;

export async function listRecipes(db: Db) {
  return query<{ id: string; name: string; published: boolean; cook_minutes: number; updated_at: string }>(
    db,
    sql`select id, name, published, cook_minutes, updated_at from recipes order by published desc, name`,
  );
}

export async function getRecipe(db: Db, id: string): Promise<RecipeInput | null> {
  const [r] = await query<{ id: string; name: string; description: string | null; cook_minutes: number; tags: string[]; steps: string[] | string; published: boolean }>(
    db,
    sql`select id, name, description, cook_minutes, tags, steps, published from recipes where id = ${id}`,
  );
  if (!r) return null;
  const ings = await query<{ ingredient_id: string; qty_per_serving: number; optional: boolean }>(
    db,
    sql`select ingredient_id, qty_per_serving, optional from recipe_ingredients where recipe_id = ${id} order by ingredient_id`,
  );
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    cookMinutes: Number(r.cook_minutes),
    tags: r.tags.filter((t) => !t.startsWith('contains:')),
    steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps,
    ingredients: ings.map((i) => ({ ingredientId: i.ingredient_id, qtyPerServing: Number(i.qty_per_serving), optional: Boolean(i.optional) })),
    published: Boolean(r.published),
  };
}

export async function saveRecipe(db: Db, input: RecipeInput) {
  const r = recipeInput.parse(input);
  const ings = await loadIngredients(db);
  const unknown = r.ingredients.filter((i) => !ings[i.ingredientId]).map((i) => i.ingredientId);
  if (unknown.length) throw new Error(`Unknown ingredients: ${unknown.join(', ')}`);
  if (new Set(r.ingredients.map((i) => i.ingredientId)).size !== r.ingredients.length) throw new Error('Each ingredient once');
  const tags = deriveTags(r.tags, r.ingredients.map((i) => i.ingredientId), (id) => ings[id]?.category);
  await db.execute(
    sql`insert into recipes (id, name, description, cook_minutes, steps, tags, published)
        values (${r.id}, ${r.name}, ${r.description}, ${r.cookMinutes}, ${JSON.stringify(r.steps)}::jsonb, ${`{${tags.join(',')}}`}::text[], ${r.published})
        on conflict (id) do update set name = excluded.name, description = excluded.description, cook_minutes = excluded.cook_minutes,
          steps = excluded.steps, tags = excluded.tags, published = excluded.published, version = recipes.version + 1, updated_at = now()`,
  );
  const rows = JSON.stringify(r.ingredients.map((i) => ({ ingredient_id: i.ingredientId, qty: i.qtyPerServing, optional: i.optional })));
  await db.execute(
    sql`with up as (
          insert into recipe_ingredients (recipe_id, ingredient_id, qty_per_serving, optional)
          select ${r.id}, x.ingredient_id, x.qty, x.optional from jsonb_to_recordset(${rows}::jsonb) as x(ingredient_id text, qty int, optional boolean)
          on conflict (recipe_id, ingredient_id) do update set qty_per_serving = excluded.qty_per_serving, optional = excluded.optional
          returning ingredient_id
        )
        delete from recipe_ingredients where recipe_id = ${r.id}
          and ingredient_id not in (select x.ingredient_id from jsonb_to_recordset(${rows}::jsonb) as x(ingredient_id text))`,
  );
  invalidateCatalogue();
  return r.id;
}

/** Cost of cooking this recipe for `servings` people, buying whole packs at one branch (fixture-free: real current prices). */
export async function costPreview(db: Db, recipe: RecipeInput, branchId: number, people: number, asOf: string) {
  const ingredients = await loadIngredients(db);
  const prices = await loadPriceSnapshot(db, { branchIds: [branchId], loyalty: [], asOf });
  const er: EngineRecipe = { id: recipe.id, cookMinutes: recipe.cookMinutes, tags: recipe.tags, published: true, ingredients: recipe.ingredients };
  const result = createEngine().plan(
    {
      days: 1, household: { light: 0, average: people, big: 0 }, budgetCents: null, shops: { mainBranchId: branchId, topUpBranchId: null }, loyalty: [],
      exclusions: [], neverSwapProteins: [], pantry: [], pinned: [{ day: 1, recipeId: recipe.id }], blocked: [], mode: 'balanced', maxCookMinutes: null, seed: 1,
    },
    { recipes: [er], ingredients, prices },
  );
  return {
    packsCents: result.totals.paidCents,
    perPlateCents: result.meals[0]?.perPlateCents ?? 0,
    unpriced: result.unpriced.map((u) => u.ingredientId),
    staples: result.pantryStaples,
  };
}
