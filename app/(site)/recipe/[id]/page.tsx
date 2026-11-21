/** Cook view (§7.3): ingredients scaled to the household, steps, timer chips. */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import { scaleQty, servingsHundredths } from '@mealstretch/engine';
import { getDb, query } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlan } from '@/lib/plans/service';
import { packLabel } from '@/lib/plans/view';
import { TimerChip } from '@/components/recipe/TimerChip';

export const dynamic = 'force-dynamic';

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9_]{2,80}$/.test(id)) notFound();
  const db = getDb();
  const locale = await getLocale();
  const [recipe] = await query<{ id: string; name: string; description: string | null; cook_minutes: number; steps: string[] | string; published: boolean }>(
    db,
    sql`select r.id, coalesce(tr.name, r.name) as name, r.description, r.cook_minutes, coalesce(tr.steps, r.steps) as steps, r.published
        from recipes r left join recipe_translations tr on tr.recipe_id = r.id and tr.language = ${locale} and tr.reviewed
        where r.id = ${id}`,
  );
  if (!recipe || !recipe.published) notFound();
  const h = await currentHousehold(db);
  const plan = h ? await latestPlan(db, h.id) : null;
  const household = plan?.request.household ?? (h ? { light: h.light, average: h.average, big: h.big } : { light: 0, average: 1, big: 0 });
  const servH = servingsHundredths(household);
  const ings = await query<{ ingredient_id: string; name: string; unit: string; round_to: number; pantry_staple: boolean; qty_per_serving: number }>(
    db,
    sql`select i.id as ingredient_id, i.name, i.unit, i.round_to, i.pantry_staple, ri.qty_per_serving
        from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id where ri.recipe_id = ${id} order by i.pantry_staple, i.name`,
  );
  const steps = (typeof recipe.steps === 'string' ? JSON.parse(recipe.steps) : recipe.steps) as string[];
  const t = await getTranslations('recipe');

  return (
    <main className="space-y-4 px-4 py-4">
      <Link href="/plan" className="tap inline-flex items-center text-sm font-semibold text-brand underline">
        ← {t('back')}
      </Link>
      <h1 className="text-2xl font-bold">{recipe.name}</h1>
      {recipe.description && <p className="text-gray-700">{recipe.description}</p>}
      <p className="text-sm text-gray-600">
        {t('minutes', { count: Number(recipe.cook_minutes) })} · {t('serves', { servings: servH / 100 })}
      </p>
      <section>
        <h2 className="font-semibold">{t('ingredients')}</h2>
        <ul className="mt-1 divide-y rounded-xl border">
          {ings.map((i) => (
            <li key={i.ingredient_id} className="flex justify-between px-3 py-2">
              <span>
                {i.name}
                {i.pantry_staple && <span className="ml-1 text-xs text-gray-500">({t('staple')})</span>}
              </span>
              <span className="font-semibold">{packLabel(scaleQty(Number(i.qty_per_serving), servH, Number(i.round_to)), i.unit)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">{t('steps')}</h2>
        <ol className="mt-1 list-decimal space-y-3 pl-5">
          {steps.map((s, k) => {
            const m = /(\d+)\s*minutes?/i.exec(s);
            return (
              <li key={k}>
                {s}
                {m && <div><TimerChip minutes={Number(m[1])} /></div>}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
