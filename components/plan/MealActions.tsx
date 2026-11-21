'use client';
/** §7.3 meal actions: Swap (3 options with deltas + never-swap), Cheaper, Remove. */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Repeat, Trash2, TrendingDown } from 'lucide-react';
import { formatRandShort } from '@/lib/money';

const SwapSheet = dynamic(() => import('./SwapSheet').then((m) => m.SwapSheet), { ssr: false });

const btn = 'press tap inline-flex min-w-0 items-center justify-center gap-1.5 rounded-pill px-2 text-small font-semibold text-primary hover:bg-surface-muted disabled:opacity-50';

export function MealActions({ planId, day, name, onNotice }: { planId: string; day: number; name: string; onNotice: (m: string) => void }) {
  const t = useTranslations('actions');
  const tp = useTranslations('plan');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const R = (c: number) => formatRandShort(c);

  const cheaper = async () => {
    setBusy(true);
    const res = await fetch(`/api/plans/${planId}/replace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day, recipeId: 'cheapest' }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return onNotice(t('failed'));
    const j = (await res.json()) as { deltaCents: number };
    onNotice(j.deltaCents < 0 ? t('cheaperDone', { amount: R(-j.deltaCents) }) : t('cheaperNone'));
    router.refresh();
  };

  const remove = async () => {
    setBusy(true);
    const res = await fetch(`/api/plans/${planId}/meals/${day}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return onNotice(t('failed'));
    const j = (await res.json()) as { savedCents: number };
    onNotice(t('removed', { amount: R(j.savedCents) }));
    router.refresh();
  };

  return (
    <div className="-mx-2 mt-2 grid grid-cols-3 border-t border-border pt-2" role="group" aria-label={t('actionsFor', { name })}>
      <button type="button" disabled={busy} onClick={() => setSheet(true)} className={btn}>
        <Repeat aria-hidden className="size-4" />
        {tp('swap')}
      </button>
      <button type="button" disabled={busy} onClick={cheaper} className={btn}>
        <TrendingDown aria-hidden className="size-4" />
        {tp('cheaper')}
      </button>
      <button type="button" disabled={busy} onClick={remove} className={btn}>
        <Trash2 aria-hidden className="size-4" />
        {tp('remove')}
      </button>
      {sheet && (
        <SwapSheet
          planId={planId}
          day={day}
          name={name}
          onClose={() => setSheet(false)}
          onDone={() => {
            setSheet(false);
            onNotice(t('swapped'));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
