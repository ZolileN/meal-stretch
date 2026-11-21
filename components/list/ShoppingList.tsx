'use client';
/** L1 shopping list (PRD §7.4): ticks offline-first, "Already have it", staples, WhatsApp share, mark shopped. */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatRandShort } from '@/lib/money';
import { dayMonth } from '@/lib/dates';
import { localTicks, mergeTicks, saveTick, syncTicks } from '@/lib/offline/ticks';
import type { ListView } from '@/lib/plans/list';

const sourceKey = { receipt: 'sourceReceipt', leaflet: 'sourceLeaflet', catalogue: 'sourceCatalogue', manual: 'sourceManual' } as const;

export function ShoppingList({ view, shareText, shareToken }: { view: ListView; shareText: string; shareToken?: string }) {
  const ticksUrl = shareToken ? `/api/share/${shareToken}/ticks` : `/api/plans/${view.planId}/ticks`;
  const owner = !shareToken;
  const t = useTranslations('list');
  const locale = useLocale();
  const router = useRouter();
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => mergeTicks(view.ticks, []));
  const [online, setOnline] = useState(true);
  const [showStaples, setShowStaples] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const R = (c: number) => formatRandShort(c);

  const refreshLocal = useCallback(async () => {
    try {
      const local = await localTicks(view.planId);
      setTicked(mergeTicks(view.ticks, local));
      if (navigator.onLine) await syncTicks(view.planId, ticksUrl);
    } catch {
      /* IndexedDB unavailable: server ticks only */
    }
  }, [view.planId, view.ticks, ticksUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    void refreshLocal();
    const on = () => {
      setOnline(true);
      void syncTicks(view.planId, ticksUrl);
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refreshLocal, view.planId, ticksUrl]);

  const toggle = async (key: string) => {
    const next = !ticked[key];
    setTicked((s) => ({ ...s, [key]: next }));
    try {
      await saveTick(view.planId, key, next);
      if (navigator.onLine) await syncTicks(view.planId, ticksUrl);
    } catch {
      /* stays local */
    }
  };

  const have = async (ingredientId: string) => {
    setBusy(true);
    const res = await fetch(`/api/plans/${view.planId}/have`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ingredientId }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const j = (await res.json()) as { savedCents: number };
      setMsg(t('haveDone', { amount: R(j.savedCents) }));
      router.refresh();
    }
  };

  const shopped = async () => {
    setBusy(true);
    const res = await fetch(`/api/plans/${view.planId}/shopped`, { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setMsg(t('shoppedDone'));
      router.refresh();
    }
  };

  const keys = view.stores.flatMap((s) => s.aisles.flatMap((a) => a.lines.map((l) => l.key)));
  const tickedCount = keys.filter((k) => ticked[k]).length;
  const allTicked = keys.length > 0 && tickedCount === keys.length;

  return (
    <main className="px-4 pb-40 pt-4">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      {!online && (
        <p role="status" className="mt-2 rounded-lg bg-amber-100 p-2 text-sm">
          {t('offline')}
        </p>
      )}
      {msg && (
        <p role="status" className="mt-2 rounded-lg bg-teal-50 p-2 text-sm">
          {msg}
        </p>
      )}
      {view.count === 0 && <p className="mt-4">{t('empty')}</p>}

      {view.stores.map((s) => (
        <section key={s.branchId} className="mt-4" aria-label={t('at', { store: s.retailerName })}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">{t('at', { store: s.retailerName })}</h2>
            <span className="text-sm text-gray-600">{t('subtotal', { amount: R(s.subtotalCents) })}</span>
          </div>
          {s.aisles.map((a) => (
            <div key={a.category} className="mt-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">{t(`aisle.${a.category}` as 'aisle.other')}</h3>
              <ul className="divide-y rounded-xl border">
                {a.lines.map((l) => (
                  <li key={l.key} className="flex items-start gap-3 px-3 py-2" data-testid="list-line">
                    <input
                      type="checkbox"
                      className="mt-1 size-6 shrink-0 accent-teal-700"
                      checked={Boolean(ticked[l.key])}
                      onChange={() => toggle(l.key)}
                      aria-label={t('tick', { name: l.productName })}
                    />
                    <div className="flex-1">
                      <p className={`font-medium ${ticked[l.key] ? 'text-gray-400 line-through' : ''}`}>{l.productName}</p>
                      <p className="text-sm text-gray-600">{t('packs', { count: l.packs, pack: l.pack })}</p>
                      <p className="flex flex-wrap gap-1 text-xs">
                        {l.tags.includes('special') && <span className="rounded bg-amber-400 px-1 font-bold text-black">{t('special')}</span>}
                        {l.tags.includes('member') && <span className="rounded bg-teal-700 px-1 font-bold text-white">{t('member')}</span>}
                        {l.tags.includes('stale') && <span className="rounded bg-gray-200 px-1">{t('stale')}</span>}
                        {l.source && l.observedAt && (
                          <span className="text-gray-500">{t('priceSource', { source: t(sourceKey[l.source]), date: dayMonth(l.observedAt, locale) })}</span>
                        )}
                      </p>
                      {owner && <button type="button" disabled={busy} onClick={() => have(l.ingredientId)} className="tap -ml-1 px-1 text-left text-sm font-semibold text-brand underline">
                        {t('alreadyHave')}
                      </button>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{R(l.totalCents)}</p>
                      {l.unitCents < l.normalUnitCents && <p className="text-xs text-gray-500 line-through">{R(l.packs * l.normalUnitCents)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {view.unpriced.length > 0 && (
        <section className="mt-4 rounded-xl border border-dashed p-3 text-sm">
          <h2 className="font-semibold">{t('unpricedTitle')}</h2>
          <p className="text-gray-600">{t('unpricedHelp')}</p>
          <ul className="mt-1 list-disc pl-5">
            {view.unpriced.map((u) => (
              <li key={u.ingredientId}>{u.name}</li>
            ))}
          </ul>
        </section>
      )}

      {view.staples.length > 0 && (
        <section className="mt-4">
          <label className="tap flex items-center gap-2 font-semibold">
            <input type="checkbox" className="size-5" checked={showStaples} onChange={(e) => setShowStaples(e.target.checked)} />
            {t('staplesToggle')}
          </label>
          {showStaples && (
            <div className="rounded-xl border p-3 text-sm" data-testid="staples">
              <p className="text-gray-600">{t('staplesHelp')}</p>
              <ul className="mt-2 space-y-1">
                {view.staples.map((s) => (
                  <li key={s.ingredientId} className="flex justify-between">
                    <span>{s.name}</span>
                    <span>{s.costCents === null ? t('cantPrice') : R(s.costCents)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-semibold">{t('staplesSubtotal', { amount: R(view.staplesSubtotalCents) })}</p>
            </div>
          )}
        </section>
      )}

      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="tap mt-4 flex items-center justify-center rounded-xl border-2 border-brand px-4 py-2 font-semibold text-brand"
      >
        {t('share')}
      </a>

      {owner && view.status === 'active' && allTicked && (
        <div className="mt-4 rounded-xl bg-teal-50 p-3" data-testid="shopped-prompt">
          <p>{t('shoppedPrompt')}</p>
          <button type="button" disabled={busy} onClick={shopped} className="tap mt-2 rounded-xl bg-brand px-4 py-2 font-semibold text-white">
            {t('markShopped')}
          </button>
        </div>
      )}

      <footer className="fixed inset-x-0 bottom-[52px] z-30 border-t bg-white px-4 py-3">
        <p className="mx-auto max-w-md text-center text-lg font-bold" data-testid="list-footer" aria-live="polite">
          {t('total', { amount: R(view.totalCents), ticked: tickedCount, count: keys.length })}
        </p>
      </footer>
    </main>
  );
}
