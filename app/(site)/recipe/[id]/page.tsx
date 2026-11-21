/** Cook view for any recipe (§7.3). */
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlan } from '@/lib/plans/service';
import { loadCookView } from '@/lib/recipes/cook';
import { CookView } from '@/components/recipe/CookView';
import { TopBar } from '@/components/ui/TopBar';

export const dynamic = 'force-dynamic';

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9_]{2,80}$/.test(id)) notFound();
  const db = getDb();
  const h = await currentHousehold(db);
  const plan = h ? await latestPlan(db, h.id) : null;
  const household = plan?.request.household ?? (h ? { light: h.light, average: h.average, big: h.big } : { light: 0, average: 1, big: 0 });
  const recipe = await loadCookView(db, id, await getLocale(), household);
  if (!recipe) notFound();
  const t = await getTranslations('recipe');
  return <CookView recipe={recipe} top={<TopBar backHref="/plan" backLabel={t('back')} />} />;
}
