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

export function PlanScreen({ view, children }: { view: PlanView; children?: React.ReactNode }) {
  const t = useTranslations('plan');
  const locale = useLocale();
  const router = useRouter();
  const { shops } = useShops();
  const [busy, setBusy] = useState<string | null>(null);
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
          {children}
        </section>
      )}

      <ul className="divide-y rounded-2xl border">
        {rest.map((m) => (
          <li key={m.day} className="flex items-baseline justify-between gap-2 px-4 py-3" data-testid={`meal-${m.day}`}>
            <span className="w-10 shrink-0 text-sm font-semibold text-gray-600">{weekdayShort(m.date, locale)}</span>
            <span className="flex-1">
              <span className="font-medium">{m.name}</span>
              <span className="block text-xs text-gray-600">
                {t('minutes', { count: m.cookMinutes })}
                {m.share && ` · ${t('shareHint', m.share)}`}
              </span>
            </span>
            <span className="whitespace-nowrap text-sm font-semibold">{t('perPlate', { amount: R(m.perPlateCents) })}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
