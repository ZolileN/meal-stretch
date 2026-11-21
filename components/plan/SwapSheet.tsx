'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatRandShort } from '@/lib/money';

interface SwapData {
  current: { recipeId: string; protein: { id: string; name: string } | null } | null;
  options: { recipeId: string; name: string; cookMinutes: number; deltaCents: number; perPlateCents: number }[];
}

export function SwapSheet({ planId, day, name, onClose, onDone }: { planId: string; day: number; name: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('actions');
  const tp = useTranslations('plan');
  const [data, setData] = useState<SwapData | null>(null);
  const [never, setNever] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const R = (c: number) => formatRandShort(c);

  const load = async () => {
    const res = await fetch(`/api/plans/${planId}/swap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day }) }).catch(() => null);
    setData(res?.ok ? ((await res.json()) as SwapData) : { current: null, options: [] });
  };
  useEffect(() => {
    // Data fetch: state is set after the request resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const delta = (c: number) => (c < 0 ? t('deltaCheaper', { amount: R(-c) }) : c > 0 ? t('deltaMore', { amount: R(c) }) : t('deltaSame'));
  const protein = data?.current?.protein;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t('swapTitle', { name })} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 outline-none">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('swapTitle', { name })}</h2>
          <button type="button" onClick={onClose} className="tap text-sm font-semibold">
            {t('close')}
          </button>
        </div>
        {!data && <p className="py-4 text-sm text-gray-600">{t('loadingOptions')}</p>}
        {data && data.options.length === 0 && <p className="py-4 text-sm">{t('noOptions')}</p>}
        {data && data.options.length > 0 && (
          <ul className="mt-2 space-y-2">
            {data.options.map((o) => (
              <li key={o.recipeId} className="flex items-center justify-between gap-2 rounded-xl border p-3" data-testid="swap-option">
                <span>
                  <span className="font-semibold">{o.name}</span>
                  <span className="block text-sm text-gray-600">
                    {tp('perPlate', { amount: R(o.perPlateCents) })} · {tp('minutes', { count: o.cookMinutes })}
                  </span>
                  <span className={`block text-sm font-semibold ${o.deltaCents < 0 ? 'text-brand' : o.deltaCents > 0 ? 'text-danger' : ''}`}>{delta(o.deltaCents)}</span>
                </span>
                <button type="button" disabled={busy} onClick={() => choose(o.recipeId)} className="tap rounded-lg bg-brand px-3 font-semibold text-white">
                  {t('choose')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {protein && (
          <label className="tap mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={never} disabled={never} onChange={neverSwap} />
            {never ? t('neverSwapOn', { protein: protein.name.toLowerCase() }) : t('neverSwap', { protein: protein.name.toLowerCase() })}
          </label>
        )}
      </div>
    </div>
  );
}
