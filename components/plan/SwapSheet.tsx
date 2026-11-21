'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { formatRandShort } from '@/lib/money';
import { Button } from '@/components/ui/Button';
import { SavingsChip } from '@/components/ui/SavingsChip';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { IdeaSearch } from './IdeaSearch';

interface SwapData {
  current: { recipeId: string; protein: { id: string; name: string } | null } | null;
  options: { recipeId: string; name: string; cookMinutes: number; deltaCents: number; perPlateCents: number }[];
}

export function SwapSheet({ planId, day, name, onClose, onDone, ideasFirst = false }: { planId: string; day: number; name: string; onClose: () => void; onDone: () => void; ideasFirst?: boolean }) {
  const t = useTranslations('actions');
  const tp = useTranslations('plan');
  const [data, setData] = useState<SwapData | null>(null);
  const [never, setNever] = useState(false);
  const [busy, setBusy] = useState(false);
  const R = (c: number) => formatRandShort(c);

  const load = async () => {
    const res = await fetch(`/api/plans/${planId}/swap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day }) }).catch(() => null);
    setData(res?.ok ? ((await res.json()) as SwapData) : { current: null, options: [] });
  };
  useEffect(() => {
    // Data fetch: state is set after the request resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (recipeId: string) => {
    setBusy(true);
    const res = await fetch(`/api/plans/${planId}/replace`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day, recipeId }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) onDone();
  };

  const neverSwap = async () => {
    const protein = data?.current?.protein;
    if (!protein) return;
    const h = (await (await fetch('/api/household')).json()) as { household: { neverSwapProteins: string[] } | null };
    const list = [...new Set([...(h.household?.neverSwapProteins ?? []), protein.id])];
    const res = await fetch('/api/household', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ neverSwapProteins: list }) });
    if (res.ok) {
      setNever(true);
      setData(null);
      await load();
    }
  };

  const protein = data?.current?.protein;

  const ideas = <IdeaSearch planId={planId} day={day} busy={busy} onChoose={choose} autoFocus={ideasFirst} />;
  return (
    <Sheet title={t('swapTitle', { name })} closeLabel={t('close')} onClose={onClose}>
      {ideasFirst && <div className="mb-5">{ideas}</div>}
      {!data && (
        <div className="space-y-2 pb-4" aria-busy="true">
          <span className="sr-only">{t('loadingOptions')}</span>
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
      )}
      {data && data.options.length === 0 && <p className="pb-4 text-small text-text-muted">{t('noOptions')}</p>}
      {data && data.options.length > 0 && (
        <ul className="space-y-2">
          {data.options.map((o) => (
            <li key={o.recipeId} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4" data-testid="swap-option">
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-semibold text-primary">{o.name}</span>
                <span className="flex flex-wrap items-center gap-x-3 text-small text-text-muted">
                  <span className="money font-semibold text-text">{tp('perPlate', { amount: R(o.perPlateCents) })}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock aria-hidden className="size-4" />
                    {tp('minutes', { count: o.cookMinutes })}
                  </span>
                </span>
                {o.deltaCents < 0 ? (
                  <SavingsChip>{t('deltaCheaper', { amount: R(-o.deltaCents) })}</SavingsChip>
                ) : (
                  <span className={`money block text-small font-semibold ${o.deltaCents > 0 ? 'text-danger' : 'text-text-muted'}`}>
                    {o.deltaCents > 0 ? t('deltaMore', { amount: R(o.deltaCents) }) : t('deltaSame')}
                  </span>
                )}
              </span>
              <Button disabled={busy} onClick={() => choose(o.recipeId)}>
                {t('choose')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!ideasFirst && <div className="mt-5 border-t border-border pt-4">{ideas}</div>}
      {protein && (
        <label className="tap mt-3 mb-2 flex items-center gap-3 text-small">
          <input type="checkbox" className="size-5 accent-primary" checked={never} disabled={never} onChange={neverSwap} />
          {never ? t('neverSwapOn', { protein: protein.name.toLowerCase() }) : t('neverSwap', { protein: protein.name.toLowerCase() })}
        </label>
      )}
    </Sheet>
  );
}
