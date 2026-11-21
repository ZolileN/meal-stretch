'use client';
/**
 * Plan summary, rands first (PRD §7.2, THEME §3/§6.3): big total, per plate, savings (amber
 * signature), budget status, savings ring, "See shopping list". Over budget always says "over".
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck, ShoppingBasket } from 'lucide-react';
import { dayMonth } from '@/lib/dates';
import { formatRandShort } from '@/lib/money';
import { distanceLabel } from '@/lib/location/geo';
import type { PlanView } from '@/lib/plans/view';
import { useShops } from '@/components/location/LocationProvider';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/MoneyText';
import { SavingsChip } from '@/components/ui/SavingsChip';
import { StatRing } from '@/components/ui/StatRing';

export function PlanSummaryCard({ view }: { view: PlanView }) {
  const t = useTranslations('plan');
  const locale = useLocale();
  const router = useRouter();
  const { shops } = useShops();
  const [busy, setBusy] = useState<string | null>(null);
  const R = (c: number) => formatRandShort(c);
  const b = view.budget;

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
    const s = shops.main?.branchId === branchId ? shops.main : shops.topUp?.branchId === branchId ? shops.topUp : null;
    return s?.distanceM !== undefined ? distanceLabel(s.distanceM) : null;
  };

  return (
    <Card aria-labelledby="plan-total" className="space-y-4 p-5" data-testid="plan-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-40 space-y-1">
          <p className="text-caption font-bold tracking-wider text-text-muted uppercase">{t('total')}</p>
          <p className="font-heading text-[2.25rem] leading-none font-extrabold [overflow-wrap:anywhere] text-primary" data-part="total">
            <MoneyText cents={view.totals.paidCents} />
          </p>
          <h1 id="plan-total" className="pt-1 font-heading text-h3 font-bold text-text">
            {t('suppersPerPlate', { count: view.meals.length, perPlate: R(view.totals.perPlateCents) })}
          </h1>
        </div>
        <StatRing pct={view.savingsPct} label={t('savingsRing', { pct: view.savingsPct })} />
      </div>

      <div className="space-y-0.5 text-small text-text">
        {view.stores.map((s) => {
          const d = distanceFor(s.branchId);
          return (
            <p key={s.branchId} className="money">
              {d ? t('atStoreDistance', { amount: R(s.paidCents), store: s.retailerName, distance: d }) : t('atStore', { amount: R(s.paidCents), store: s.retailerName })}
            </p>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SavingsChip data-testid="plan-savings">{t('youSave', { amount: R(view.totals.savingsCents), pct: view.savingsPct })}</SavingsChip>
        <span className="text-caption text-text-muted">{t('specialsUsed', { count: view.specialsUsed })}</span>
      </div>

      {b.status === 'under' && (
        <p className="flex items-center gap-2 font-semibold text-success" data-testid="budget-status">
          <CircleCheck aria-hidden className="size-5 shrink-0" />
          <span className="money">{t('left', { amount: R(b.remainingCents!), budget: R(b.budgetCents!) })}</span>
        </p>
      )}
      {b.status === 'over' && (
        <div className="space-y-3 rounded-input bg-danger-soft p-4">
          <p className="flex items-center gap-2 font-semibold text-danger" role="status" data-testid="budget-status">
            <CircleAlert aria-hidden className="size-5 shrink-0" />
            <span className="money">{t('over', { amount: R(b.shortfallCents!), budget: R(b.budgetCents!) })}</span>
          </p>
          {view.mode === 'balanced' && (
            <Button variant="danger" size="lg" loading={busy === 'fit'} loadingLabel={t('fitting')} disabled={busy !== null} onClick={() => rerun('fit', { mode: 'cheapest' })}>
              {t('fitBudget')}
            </Button>
          )}
          {view.mode === 'cheapest' && b.maxAffordableDays !== null && b.maxAffordableDays >= 3 && (
            <div className="space-y-2">
              <p className="text-small text-text">{t('coversDays', { budget: R(b.budgetCents!), days: b.maxAffordableDays, total: view.meals.length })}</p>
              <Button variant="danger" disabled={busy !== null} loading={busy === 'days'} onClick={() => rerun('days', { mode: 'cheapest', days: b.maxAffordableDays! })}>
                {t('useDays', { days: b.maxAffordableDays })}
              </Button>
            </div>
          )}
          {view.mode === 'cheapest' && b.maxAffordableDays === 0 && <p className="text-small text-text">{t('nothingFits')}</p>}
          {view.mode === 'cheapest' && b.maxAffordableDays !== null && b.maxAffordableDays > 0 && b.maxAffordableDays < 3 && (
            <p className="text-small text-text">{t('tooFewDays', { budget: R(b.budgetCents!), days: b.maxAffordableDays })}</p>
          )}
        </div>
      )}

      <p className="text-caption text-text-muted">
        {view.newestPriceDate && t('pricesChecked', { date: dayMonth(view.newestPriceDate, locale) })}
        {view.staleCount > 0 && ` · ${t('mayHaveChanged', { count: view.staleCount })}`}
      </p>
      {view.unpriced.length > 0 && (
        <details className="rounded-input border border-dashed border-border px-4 py-1 text-small" data-testid="unpriced">
          <summary className="tap flex cursor-pointer items-center font-semibold text-primary">{t('unpricedLink', { count: view.unpriced.length })}</summary>
          <p className="text-text-muted">{t('unpricedNote')}</p>
          <ul className="mt-1 mb-2 list-disc space-y-0.5 pl-5">
            {view.unpriced.map((u) => (
              <li key={u.ingredientId}>
                {u.name} <span className="text-text-muted">{t('unpricedFor', { recipes: u.recipes.join(', ') })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <ButtonLink href="/list" size="lg" icon={<ShoppingBasket aria-hidden className="size-5" />}>
        {t('seeList', { count: view.listItems })}
      </ButtonLink>
    </Card>
  );
}
