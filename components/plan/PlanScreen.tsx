'use client';
/** P1 plan screen (PRD §7.2): rands-first summary, then the day-by-day meal cards. */
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { pickTonight } from '@/lib/plans/tonight';
import type { PlanView } from '@/lib/plans/view';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CoachMark } from '@/components/ui/CoachMark';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Toast } from '@/components/ui/Toast';
import { MealCard } from './MealCard';
import { PlanSummaryCard } from './PlanSummaryCard';
import { StealCard } from './StealCard';
import type { SignInMethods } from '@/lib/auth/methods';

// Secondary, below-the-fold pieces load after the plan itself (first-load JS budget, PRD §15).
const PlanExtras = dynamic(() => import('./PlanExtras').then((m) => m.PlanExtras), { ssr: false });
const TweakBox = dynamic(() => import('./TweakBox').then((m) => m.TweakBox), { ssr: false });
const AccountPrompt = dynamic(() => import('@/components/account/AccountPrompt').then((m) => m.AccountPrompt), { ssr: false });

export function PlanScreen({
  view,
  today,
  shoppedPrompt = false,
  signedIn = false,
  signInMethods = { google: false, email: false },
}: {
  view: PlanView;
  today: string;
  shoppedPrompt?: boolean;
  signedIn?: boolean;
  signInMethods?: SignInMethods;
}) {
  const t = useTranslations('plan');
  const tc = useTranslations('coach');
  const [notice, setNotice] = useState<string | null>(null);
  const clear = useCallback(() => setNotice(null), []);
  const editable = view.status === 'active';
  const tonight = pickTonight(view.meals, today);

  return (
    <main className="space-y-3 px-gutter pt-2 pb-4">
      <Toast message={notice} onDone={clear} testId="notice" />
      {shoppedPrompt && editable && (
        <Card tone="savings" bordered={false} className="space-y-3 p-5">
          <p className="text-small text-text">{t('shoppedPrompt')}</p>
          <ButtonLink href="/list" variant="secondary">
            {t('seeList', { count: view.listItems })}
          </ButtonLink>
        </Card>
      )}
      <PlanSummaryCard view={view} />
      {editable && view.meals.length > 0 && (
        <CoachMark
          id="meal-actions"
          steps={[
            { title: tc('actionsTitle'), text: tc('actionsText') },
            { title: tc('listTitle'), text: tc('listText') },
          ]}
          labels={{ skip: tc('skip'), next: tc('next'), done: tc('done'), step: (n, total) => tc('step', { n, total }) }}
        />
      )}
      <SectionHeader title={t('yourSuppers')} className="pt-3" />
      <ul className="space-y-3">
        {view.meals.map((m) => (
          <MealCard key={m.day} meal={m} planId={view.planId} editable={editable} tonight={tonight?.isToday === true && tonight.meal.day === m.day} onNotice={setNotice} />
        ))}
      </ul>
      {editable && <TweakBox planId={view.planId} />}
      {view.steal && <StealCard steal={view.steal} />}
      <PlanExtras />
      <AccountPrompt signedIn={signedIn} methods={signInMethods} />
    </main>
  );
}
