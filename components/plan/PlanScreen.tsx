'use client';
/** P1 plan screen (PRD §7.2). */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { dayMonth, weekdayShort } from '@/lib/dates';
import { formatRandShort } from '@/lib/money';
import { distanceLabel } from '@/lib/location/geo';
import type { PlanView } from '@/lib/plans/view';
import { useShops } from '@/components/location/LocationProvider';
import { MealActions } from './MealActions';
import { PlanExtras } from './PlanExtras';
import { TweakBox } from './TweakBox';

export function PlanScreen({ view, shoppedPrompt = false }: { view: PlanView; shoppedPrompt?: boolean }) {
  const t = useTranslations('plan');
  const locale = useLocale();
  const router = useRouter();
  const { shops } = useShops();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const editable = view.status === 'active';
  const R = (c: number) => formatRandShort(c);

  const rerun = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromPlanId: view.planId, ...body }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) router.refresh();
  };

  const distanceFor = (branchId: number) => {
    const b = shops.main?.branchId === branchId ? shops.main : shops.topUp?.branchId === branchId ? shops.topUp : null;
    return b?.distanceM !== undefined ? distanceLabel(b.distanceM) : null;
  };
  const b = view.budget;
  const [tonight, ...rest] = view.meals;

  return (
    <main className="space-y-4 px-4 py-4">
      {notice && (
        <p role="status" className="rounded-lg bg-teal-50 p-2 text-sm" data-testid="notice">
          {notice}
        </p>
      )}
      {shoppedPrompt && editable && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm">
          <p>{t('shoppedPrompt')}</p>
          <Link href="/list" className="tap mt-1 inline-flex items-center font-semibold text-brand underline">
            {t('seeList', { count: view.listItems })}
          </Link>
        </div>
      )}
      <section aria-labelledby="plan-total" className="space-y-1 rounded-2xl border p-4" data-testid="plan-header">
        <h1 id="plan-total" className="text-xl font-bold">
          {t('suppersPerPlate', { count: view.meals.length, perPlate: R(view.totals.perPlateCents) })}
        </h1>
        {view.stores.map((s) => {
          const d = distanceFor(s.branchId);
          return (
            <p key={s.branchId} className="text-lg font-semibold">
              {d ? t('atStoreDistance', { amount: R(s.paidCents), store: s.retailerName, distance: d }) : t('atStore', { amount: R(s.paidCents), store: s.retailerName })}
            </p>
          );
        })}
        <p data-testid="plan-savings">
          {t('youSave', { amount: R(view.totals.savingsCents), pct: view.savingsPct })} · {t('specialsUsed', { count: view.specialsUsed })}
        </p>
        {b.status === 'under' && (
          <p className="font-semibold text-brand" data-testid="budget-status">
            ✅ {t('left', { amount: R(b.remainingCents!), budget: R(b.budgetCents!) })}
          </p>
        )}
        {b.status === 'over' && (
          <div className="space-y-2">
            <p className="font-semibold text-danger" role="status" data-testid="budget-status">
              {t('over', { amount: R(b.shortfallCents!), budget: R(b.budgetCents!) })}
            </p>
            {view.mode === 'balanced' && (
              <button type="button" disabled={busy !== null} onClick={() => rerun('fit', { mode: 'cheapest' })} className="tap w-full rounded-xl bg-danger px-4 py-2 font-semibold text-white">
                {busy === 'fit' ? t('fitting') : t('fitBudget')}
              </button>
            )}
            {view.mode === 'cheapest' && b.maxAffordableDays !== null && b.maxAffordableDays >= 3 && (
              <div className="space-y-2 rounded-xl bg-red-50 p-3">
                <p>{t('coversDays', { budget: R(b.budgetCents!), days: b.maxAffordableDays, total: view.meals.length })}</p>
                <button type="button" disabled={busy !== null} onClick={() => rerun('days', { mode: 'cheapest', days: b.maxAffordableDays! })} className="tap rounded-xl bg-danger px-4 py-2 font-semibold text-white">
                  {t('useDays', { days: b.maxAffordableDays })}
                </button>
              </div>
            )}
            {view.mode === 'cheapest' && b.maxAffordableDays === 0 && <p className="text-sm">{t('nothingFits')}</p>}
            {view.mode === 'cheapest' && b.maxAffordableDays !== null && b.maxAffordableDays > 0 && b.maxAffordableDays < 3 && (
              <p className="text-sm">{t('tooFewDays', { budget: R(b.budgetCents!), days: b.maxAffordableDays })}</p>
            )}
          </div>
        )}
        <p className="text-xs text-gray-600">
          {view.newestPriceDate && t('pricesChecked', { date: dayMonth(view.newestPriceDate, locale) })}
          {view.staleCount > 0 && ` · ${t('mayHaveChanged', { count: view.staleCount })}`}
        </p>
        {view.unpriced.length > 0 && (
          <details className="text-sm" data-testid="unpriced">
            <summary className="tap cursor-pointer font-semibold text-brand underline">{t('unpricedLink', { count: view.unpriced.length })}</summary>
            <p className="mt-1 text-gray-600">{t('unpricedNote')}</p>
            <ul className="mt-1 list-disc pl-5">
              {view.unpriced.map((u) => (
                <li key={u.ingredientId}>
                  {u.name} <span className="text-gray-600">{t('unpricedFor', { recipes: u.recipes.join(', ') })}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <Link href="/list" className="tap mt-2 flex items-center justify-center rounded-xl bg-brand px-4 py-2 font-semibold text-white">
          {t('seeList', { count: view.listItems })}
        </Link>
      </section>

      {tonight && (
        <section className="rounded-2xl border-2 border-brand p-4" data-testid={`meal-${tonight.day}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-brand">
            {t('tonight')} · {weekdayShort(tonight.date, locale)}
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">{tonight.name}</h2>
            <span className="whitespace-nowrap font-semibold">{t('perPlate', { amount: R(tonight.perPlateCents) })}</span>
          </div>
          <p className="text-sm text-gray-600">
            {t('minutes', { count: tonight.cookMinutes })}
            {tonight.share && ` · ${t('shareHint', tonight.share)}`}
          </p>
          {editable && <MealActions planId={view.planId} day={tonight.day} recipeId={tonight.recipeId} name={tonight.name} onNotice={setNotice} />}
        </section>
      )}

      <ul className="divide-y rounded-2xl border">
        {rest.map((m) => (
          <li key={m.day} data-testid={`meal-${m.day}`}>
            <button
              type="button"
              className="tap flex w-full items-baseline justify-between gap-2 px-4 py-3 text-left"
              aria-expanded={open === m.day}
              aria-label={t('actionsFor', { name: m.name })}
              onClick={() => setOpen(open === m.day ? null : m.day)}
            >
              <span className="w-10 shrink-0 text-sm font-semibold text-gray-600">{weekdayShort(m.date, locale)}</span>
              <span className="flex-1">
                <span className="font-medium">{m.name}</span>
                <span className="block text-xs text-gray-600">
                  {t('minutes', { count: m.cookMinutes })}
                  {m.share && ` · ${t('shareHint', m.share)}`}
                </span>
              </span>
              <span className="whitespace-nowrap text-sm font-semibold">{t('perPlate', { amount: R(m.perPlateCents) })}</span>
            </button>
            {open === m.day && editable && (
              <div className="px-4 pb-3">
                <MealActions planId={view.planId} day={m.day} recipeId={m.recipeId} name={m.name} onNotice={setNotice} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {editable && <TweakBox planId={view.planId} />}
      {view.steal && <StealCard steal={view.steal} />}
      <PlanExtras />
    </main>
  );
}

function StealCard({ steal }: { steal: NonNullable<PlanView['steal']> }) {
  const t = useTranslations('steal');
  const locale = useLocale();
  return (
    <section className="rounded-2xl border-2 border-accent bg-amber-50 p-4" data-testid="steal">
      <h2 className="text-sm font-bold uppercase tracking-wide">{t('title')}</h2>
      <p className="mt-1 font-semibold">
        {t('line', { product: steal.productName, pack: steal.pack, price: formatRandShort(steal.specialCents), store: steal.retailerName })}
      </p>
      <p className="text-sm text-gray-700">
        {t('was', { amount: formatRandShort(steal.normalCents) })} (−{steal.pct}%)
        {steal.lowestInWeeks && ` · ${t('lowest', { weeks: steal.lowestInWeeks })}`}
        {steal.endsOn && ` · ${t('ends', { date: dayMonth(steal.endsOn, locale) })}`}
      </p>
    </section>
  );
}
