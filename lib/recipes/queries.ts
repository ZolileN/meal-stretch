import { sql } from 'drizzle-orm';
import type { EngineIngredient, EngineRecipe } from '@mealstretch/engine';
import { query, type Db } from '@/lib/db';

export async function loadIngredients(db: Db): Promise<Record<string, EngineIngredient & { name: string }>> {
  const rows = await query<{ id: string; name: string; unit: EngineIngredient['unit']; round_to: number; perishable: boolean; pantry_staple: boolean; category: string }>(
    db,
    sql`select id, name, unit, round_to, perishable, pantry_staple, category from ingredients`,
  );
  return Object.fromEntries(
    rows.map((r) => [r.id, { id: r.id, name: r.name, unit: r.unit, roundTo: Number(r.round_to), perishable: Boolean(r.perishable), pantryStaple: Boolean(r.pantry_staple), category: r.category }]),
  );
}

export async function loadPublishedRecipes(db: Db): Promise<EngineRecipe[]> {
  const rows = await query<{ id: string; cook_minutes: number; tags: string[]; ingredient_id: string; qty_per_serving: number; optional: boolean }>(
    db,
    sql`select r.id, r.cook_minutes, r.tags, ri.ingredient_id, ri.qty_per_serving, ri.optional
        from recipes r join recipe_ingredients ri on ri.recipe_id = r.id
        where r.published
        order by r.id, ri.ingredient_id`,
  );
  const byId = new Map<string, EngineRecipe>();
  for (const r of rows) {
    let rec = byId.get(r.id);
    if (!rec) {
      rec = { id: r.id, cookMinutes: Number(r.cook_minutes), tags: r.tags, published: true, ingredients: [] };
      byId.set(r.id, rec);
    }
    rec.ingredients.push({ ingredientId: r.ingredient_id, qtyPerServing: Number(r.qty_per_serving), optional: Boolean(r.optional) });
  }
  return [...byId.values()];
}

export async function recipeNames(db: Db, ids: string[], language = 'en'): Promise<Map<string, { name: string; cookMinutes: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await query<{ id: string; name: string; cook_minutes: number }>(
    db,
    sql`select r.id, coalesce(t.name, r.name) as name, r.cook_minutes
        from recipes r left join recipe_translations t on t.recipe_id = r.id and t.language = ${language} and t.reviewed
        where r.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
  );
  return new Map(rows.map((r) => [r.id, { name: r.name, cookMinutes: Number(r.cook_minutes) }]));
}
