/** Tonight tab: the cook view for today's supper (or the next one), straight from the nav. */
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { CookingPot } from 'lucide-react';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { isoDateInSA } from '@/lib/period';
import { latestPlan } from '@/lib/plans/service';
import { buildPlanView } from '@/lib/plans/view';
import { pickTonight } from '@/lib/plans/tonight';
import { loadCookView } from '@/lib/recipes/cook';
import { CookView } from '@/components/recipe/CookView';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

export default async function TonightPage() {
  const db = getDb();
  const h = await currentHousehold(db);
  const plan = h ? await latestPlan(db, h.id) : null;
  if (!plan) redirect('/start');
  const locale = await getLocale();
  const [t, view] = await Promise.all([getTranslations('home'), buildPlanView(db, plan, locale)]);
  const pick = pickTonight(view.meals, isoDateInSA(new Date()));
  const recipe = pick ? await loadCookView(db, pick.meal.recipeId, locale, plan.request.household) : null;
  if (!pick || !recipe)
    return (
      <main className="px-gutter pt-2 pb-4">
        <h1 className="sr-only">{t('tonightEyebrow')}</h1>
        <EmptyState icon={<CookingPot className="size-6" />} title={t('nothingTonight')} text={t('nothingTonightText')} action={<ButtonLink href="/start/household" size="lg">{t('newPlan')}</ButtonLink>} />
      </main>
    );
  return <CookView recipe={recipe} eyebrow={pick.isToday ? t('tonightEyebrow') : t('upNextEyebrow')} />;
}
