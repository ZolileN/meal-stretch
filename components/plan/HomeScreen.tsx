'use client';
/** Home (THEME §3): plan summary first, Tonight hero, what's coming up, shortcuts, steal of the week. */
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock, CookingPot, PackageCheck, Repeat, Sparkles, TrendingDown, Zap } from 'lucide-react';
import { formatRandShort } from '@/lib/money';
import { pickTonight } from '@/lib/plans/tonight';
import type { PlanView } from '@/lib/plans/view';
import { Button, ButtonLink } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/HeroCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ShortcutTile } from '@/components/ui/ShortcutTile';
import { Toast } from '@/components/ui/Toast';
import { MealCard } from './MealCard';
import { PlanSummaryCard } from './PlanSummaryCard';
import { StealCard } from './StealCard';

const SwapSheet = dynamic(() => import('./SwapSheet').then((m) => m.SwapSheet), { ssr: false });

export function HomeScreen({ view, today }: { view: PlanView; today: string }) {
  const t = useTranslations('home');
  const tp = useTranslations('plan');
  const ta = useTranslations('actions');
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [swap, setSwap] = useState<false | 'swap' | 'ideas'>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const clear = useCallback(() => setNotice(null), []);
  const editable = view.status === 'active';
  const tonight = pickTonight(view.meals, today);
  const next = view.meals.filter((m) => m.date >= today && m.day !== tonight?.meal.day).slice(0, 3);

  const rerun = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    const res = await fetch('/api/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fromPlanId: view.planId, ...body }) }).catch(() => null);
    setBusy(null);
    setNotice(res?.ok ? done : ta('failed'));
    if (res?.ok) router.refresh();
  };

  return (
    <main className="space-y-3 px-gutter pt-2 pb-4">
      <Toast message={notice} onDone={clear} testId="notice" />
      <PlanSummaryCard view={view} />

      {tonight && (
        <HeroCard
          data-testid="tonight-hero"
          eyebrow={tonight.isToday ? t('tonightEyebrow') : t('upNextEyebrow')}
          title={tonight.meal.name}
          imageUrl={tonight.meal.imageUrl}
          meta={
            <span className="inline-flex flex-wrap items-center gap-x-3">
              <span className="money font-semibold">{tp('perPlate', { amount: formatRandShort(tonight.meal.perPlateCents) })}</span>
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden className="size-4" />
                {tp('minutes', { count: tonight.meal.cookMinutes })}
              </span>
            </span>
          }
          actions={
            <>
              <ButtonLink href="/tonight" variant="inverse" icon={<CookingPot aria-hidden className="size-4" />}>
                {t('startCooking')}
              </ButtonLink>
              {editable && (
                <Button variant="translucent" onClick={() => setSwap('swap')} icon={<Repeat aria-hidden className="size-4" />}>
                  {tp('swap')}
                </Button>
              )}
            </>
          }
        />
      )}
      {swap && tonight && (
        <SwapSheet
          planId={view.planId}
          day={tonight.meal.day}
          name={tonight.meal.name}
          ideasFirst={swap === 'ideas'}
          onClose={() => setSwap(false)}
          onDone={() => {
            setSwap(false);
            setNotice(ta('swapped'));
            router.refresh();
          }}
        />
      )}

      {next.length > 0 && (
        <>
          <SectionHeader title={t('comingUp')} action={{ href: '/plan', label: t('seeAll') }} className="pt-3" />
          <ul className="space-y-3">
            {next.map((m) => (
              <MealCard key={m.day} meal={m} planId={view.planId} editable={editable} onNotice={setNotice} />
            ))}
          </ul>
        </>
      )}

      {editable && (
        <>
          <SectionHeader title={t('shortcuts')} className="pt-3" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-3">
            {tonight && <ShortcutTile icon={<Sparkles className="size-5" />} title={t('ideas')} subtitle={t('ideasSub')} onClick={() => setSwap('ideas')} />}
            <ShortcutTile
              icon={<TrendingDown className="size-5" />}
              title={t('cheaperWeek')}
              subtitle={view.mode === 'cheapest' ? t('cheaperWeekOn') : t('cheaperWeekSub')}
              disabled={busy !== null || view.mode === 'cheapest'}
              onClick={() => rerun('cheap', { mode: 'cheapest' }, t('cheaperWeekDone'))}
            />
            <ShortcutTile icon={<PackageCheck className="size-5" />} title={t('useWhatIHave')} subtitle={t('useWhatIHaveSub')} href="/list" />
            <ShortcutTile
              icon={<Zap className="size-5" />}
              title={t('quick')}
              subtitle={t('quickSub')}
              disabled={busy !== null}
              onClick={() => rerun('quick', { mode: view.mode, maxCookMinutes: 30 }, t('quickDone'))}
            />
          </div>
        </>
      )}

      {view.steal && <StealCard steal={view.steal} />}
    </main>
  );
}
