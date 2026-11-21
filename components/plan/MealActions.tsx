'use client';
/** §7.3 meal actions: Cook, Swap (3 options with deltas + never-swap), Cheaper, Remove. */
import Link from 'next/link';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatRandShort } from '@/lib/money';

const SwapSheet = dynamic(() => import('./SwapSheet').then((m) => m.SwapSheet), { ssr: false });


export function MealActions({ planId, day, recipeId, name, onNotice }: { planId: string; day: number; recipeId: string; name: string; onNotice: (m: string) => void }) {
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
    <div className="mt-3 flex flex-wrap gap-2">
      <Link href={`/recipe/${recipeId}`} className="tap flex items-center rounded-lg border px-3 text-sm font-semibold">
        {tp('cook')}
      </Link>
      <button type="button" disabled={busy} onClick={() => setSheet(true)} className="tap rounded-lg border px-3 text-sm font-semibold">
        {tp('swap')}
      </button>
      <button type="button" disabled={busy} onClick={cheaper} className="tap rounded-lg border px-3 text-sm font-semibold">
        {tp('cheaper')}
      </button>
      <button type="button" disabled={busy} onClick={remove} className="tap rounded-lg border px-3 text-sm font-semibold text-danger">
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

