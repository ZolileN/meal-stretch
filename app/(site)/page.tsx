import { getLocale, getTranslations } from 'next-intl/server';
import { PiggyBank, Tag, Wallet } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { isoDateInSA } from '@/lib/period';
import { latestPlan } from '@/lib/plans/service';
import { buildPlanView } from '@/lib/plans/view';
import { HomeScreen } from '@/components/plan/HomeScreen';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const t = await getTranslations('home');
  // Once a plan exists, Home is the plan at a glance (§7.2, THEME §3).
  const db = getDb();
  const h = await currentHousehold(db).catch(() => null);
  const plan = h ? await latestPlan(db, h.id) : null;
  if (plan) return <HomeScreen view={await buildPlanView(db, plan, await getLocale())} today={isoDateInSA(new Date())} />;

  const points = [
    { Icon: Wallet, title: t('pointBudget'), text: t('pointBudgetText') },
    { Icon: Tag, title: t('pointSpecials'), text: t('pointSpecialsText') },
    { Icon: PiggyBank, title: t('pointSavings'), text: t('pointSavingsText') },
  ];
  return (
    <main className="space-y-5 px-gutter pt-4 pb-4">
      <section className="space-y-3">
        <h1 className="font-heading text-display font-extrabold text-primary">{t('headline')}</h1>
        <p className="text-text-muted">{t('intro')}</p>
      </section>
      <Card as="div" className="p-5">
        <ul className="space-y-4">
          {points.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-savings-soft text-savings-text">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold text-primary">{title}</span>
                <span className="block text-small text-text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <ButtonLink href="/start" size="lg">
        {t('start')}
      </ButtonLink>
      <p className="text-center text-caption text-text-muted">{BRAND.tagline}</p>
    </main>
  );
}
