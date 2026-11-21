/** Data for the cook view (§7.3): recipe in the user's language, ingredients scaled to the household. */
import { sql } from 'drizzle-orm';
import { scaleQty, servingsHundredths } from '@mealstretch/engine';
import { query, type Db } from '@/lib/db';
import { packLabel } from '@/lib/plans/view';

export interface CookView {
  id: string;
  name: string;
  description: string | null;
  cookMinutes: number;
  imageUrl: string | null;
  servings: number;
  ingredients: { id: string; name: string; staple: boolean; qty: string }[];
  steps: { text: string; timerMinutes: number | null }[];
}

export async function loadCookView(db: Db, id: string, locale: string, household: { light: number; average: number; big: number }): Promise<CookView | null> {
  const [recipe] = await query<{ id: string; name: string; description: string | null; cook_minutes: number; steps: string[] | string; published: boolean; image_url: string | null }>(
    db,
    sql`select r.id, coalesce(tr.name, r.name) as name, r.description, r.cook_minutes, coalesce(tr.steps, r.steps) as steps, r.published, r.image_url
        from recipes r left join recipe_translations tr on tr.recipe_id = r.id and tr.language = ${locale} and tr.reviewed
        where r.id = ${id}`,
  );
  if (!recipe || !recipe.published) return null;
  const servH = servingsHundredths(household);
  const ings = await query<{ ingredient_id: string; name: string; unit: string; round_to: number; pantry_staple: boolean; qty_per_serving: number }>(
    db,
    sql`select i.id as ingredient_id, i.name, i.unit, i.round_to, i.pantry_staple, ri.qty_per_serving
        from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id where ri.recipe_id = ${id} order by i.pantry_staple, i.name`,
  );
  const steps = (typeof recipe.steps === 'string' ? JSON.parse(recipe.steps) : recipe.steps) as string[];
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    cookMinutes: Number(recipe.cook_minutes),
    imageUrl: recipe.image_url ?? null,
    servings: servH / 100,
    ingredients: ings.map((i) => ({
      id: i.ingredient_id,
      name: i.name,
      staple: i.pantry_staple,
      qty: packLabel(scaleQty(Number(i.qty_per_serving), servH, Number(i.round_to)), i.unit),
    })),
    steps: steps.map((text) => {
      const m = /(\d+)\s*minutes?/i.exec(text);
      return { text, timerMinutes: m ? Number(m[1]) : null };
    }),
  };
}
