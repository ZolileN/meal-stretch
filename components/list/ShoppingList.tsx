'use client';
/** L1 shopping list (PRD §7.4): ticks offline-first, "Already have it", staples, WhatsApp share, mark shopped. */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatRandShort } from '@/lib/money';
import { dayMonth } from '@/lib/dates';
import { localTicks, mergeTicks, saveTick, syncTicks } from '@/lib/offline/ticks';
import type { ListView } from '@/lib/plans/list';
import { CircleCheck, ListChecks, MessageCircle, PackageCheck, ShoppingBasket, Store, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { MoneyText } from '@/components/ui/MoneyText';
import { Toast } from '@/components/ui/Toast';

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
  const [open, setOpen] = useState<string | null>(null);
  const clear = useCallback(() => setMsg(null), []);
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

  const keys = [...view.stores.flatMap((s) => s.aisles.flatMap((a) => a.lines.map((l) => l.key))), ...view.unpriced.map((u) => u.key)];
  const tickedCount = keys.filter((k) => ticked[k]).length;
  const allTicked = keys.length > 0 && tickedCount === keys.length;

  return (
    <main className="space-y-4 px-gutter pt-2 pb-32">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-h1 font-extrabold text-primary">{t('title')}</h1>
        {view.count > 0 && <Badge tone="count" aria-label={t('itemsCount', { count: view.count })}>{view.count}</Badge>}
      </div>
      {!online && (
        <p role="status" className="flex items-center gap-2 rounded-input bg-savings-soft px-4 py-3 text-small text-text">
          <WifiOff aria-hidden className="size-5 shrink-0 text-savings-text" />
          {t('offline')}
        </p>
      )}
      <Toast message={msg} onDone={clear} above="footer" />
      {view.count === 0 && <EmptyState icon={<ShoppingBasket className="size-6" />} title={t('empty')} />}

      {view.stores.map((s) => (
        <section key={s.branchId} className="space-y-3" aria-label={t('at', { store: s.retailerName })}>
          <div className="flex items-baseline justify-between gap-3 pt-1">
            <h2 className="flex items-center gap-2 font-heading text-h2 font-bold text-primary">
              <Store aria-hidden className="size-5" />
              {t('at', { store: s.retailerName })}
            </h2>
            <span className="money text-small font-semibold text-text-muted">{t('subtotal', { amount: R(s.subtotalCents) })}</span>
          </div>
          {s.aisles.map((a) => {
            const aisle = t(`aisle.${a.category}` as 'aisle.other');
            const sub = a.lines.reduce((n, l) => n + l.totalCents, 0);
            return (
              <Card key={a.category} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border bg-surface-muted/50 px-4 py-2.5">
                  <h3 className="flex-1 text-caption font-bold tracking-wider text-text-muted uppercase">{aisle}</h3>
                  <span className="money text-small font-semibold text-text">{R(sub)}</span>
                  <Badge tone="count" aria-label={t('itemsCount', { count: a.lines.length })}>
                    {a.lines.length}
                  </Badge>
                </div>
                <ul className="divide-y divide-border">
                  {a.lines.map((l) => (
                    <ListRow
                      key={l.key}
                      data-testid="list-line"
                      checked={Boolean(ticked[l.key])}
                      onToggle={() => toggle(l.key)}
                      checkLabel={t('tick', { name: l.productName })}
                      name={l.productName}
                      detail={
                        <>
                          {t('packs', { count: l.packs, pack: l.pack })}
                          {l.source && l.observedAt && (
                            <span className="block text-caption">{t('priceSource', { source: t(sourceKey[l.source]), date: dayMonth(l.observedAt, locale) })}</span>
                          )}
                        </>
                      }
                      tags={
                        (l.tags.includes('special') || l.tags.includes('member') || l.tags.includes('stale')) && (
                          <>
                            {l.tags.includes('special') && <Badge tone="special">{t('special')}</Badge>}
                            {l.tags.includes('member') && <Badge tone="member">{t('member')}</Badge>}
                            {l.tags.includes('stale') && <Badge tone="stale">{t('stale')}</Badge>}
                          </>
                        )
                      }
                      price={
                        <>
                          <MoneyText cents={l.totalCents} className="block font-semibold" />
                          {l.unitCents < l.normalUnitCents && <MoneyText cents={l.packs * l.normalUnitCents} strike strikeLabel={t('wasLabel')} className="block text-caption" />}
                        </>
                      }
                      expanded={open === l.key}
                      onExpand={owner ? () => setOpen(open === l.key ? null : l.key) : undefined}
                      moreLabel={t('more', { name: l.productName })}
                    >
                      {owner && (
                        <Button variant="secondary" disabled={busy} onClick={() => have(l.ingredientId)} icon={<PackageCheck aria-hidden className="size-4" />}>
                          {t('alreadyHave')}
                        </Button>
                      )}
                    </ListRow>
                  ))}
                </ul>
              </Card>
            );
          })}
        </section>
      ))}

      {view.unpriced.length > 0 && (
        <Card as="section" className="overflow-hidden" aria-label={t('unpricedTitle')} data-testid="unpriced-lines">
          <div className="border-b border-border bg-surface-muted/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-caption font-bold tracking-wider text-text-muted uppercase">{t('unpricedTitle')}</h2>
              <Badge tone="count" aria-label={t('itemsCount', { count: view.unpriced.length })}>
                {view.unpriced.length}
              </Badge>
            </div>
            <p className="mt-1 text-caption text-text-muted">{t('unpricedHelp')}</p>
          </div>
          <ul className="divide-y divide-border">
            {view.unpriced.map((u) => (
              <ListRow
                key={u.key}
                data-testid="list-line-unpriced"
                checked={Boolean(ticked[u.key])}
                onToggle={() => toggle(u.key)}
                checkLabel={t('tick', { name: u.name })}
                name={u.name}
                detail={t('needed', { amount: u.needed })}
                price={<span className="text-caption text-text-muted">{t('noPrice')}</span>}
              />
            ))}
          </ul>
        </Card>
      )}

      {view.staples.length > 0 && (
        <Card as="section" className="p-5">
          <label className="tap flex cursor-pointer items-center gap-3 font-semibold text-primary">
            <input type="checkbox" className="size-5 accent-primary" checked={showStaples} onChange={(e) => setShowStaples(e.target.checked)} />
            {t('staplesToggle')}
          </label>
          {showStaples && (
            <div className="mt-2 text-small" data-testid="staples">
              <p className="text-text-muted">{t('staplesHelp')}</p>
              <ul className="mt-2 divide-y divide-border">
                {view.staples.map((s) => (
                  <li key={s.ingredientId} className="flex justify-between gap-3 py-2">
                    <span>{s.name}</span>
                    <span className="money">{s.costCents === null ? t('cantPrice') : R(s.costCents)}</span>
                  </li>
                ))}
              </ul>
              <p className="money mt-2 font-semibold">{t('staplesSubtotal', { amount: R(view.staplesSubtotalCents) })}</p>
            </div>
          )}
        </Card>
      )}

      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass('secondary', 'lg')}
      >
        <MessageCircle aria-hidden className="size-5" />
        {t('share')}
      </a>

      {owner && view.status === 'active' && allTicked && (
        <Card tone="savings" bordered={false} className="space-y-3 p-5" data-testid="shopped-prompt">
          <p className="text-text">{t('shoppedPrompt')}</p>
          <Button loading={busy} onClick={shopped} icon={<CircleCheck aria-hidden className="size-5" />}>
            {t('markShopped')}
          </Button>
        </Card>
      )}

      <div className="bottom-above-nav pointer-events-none fixed inset-x-0 z-30 px-4" data-floating>
        <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-3 rounded-card border border-border bg-surface px-5 py-3 shadow-float">
          <p className="money font-heading text-h3 font-extrabold text-primary" data-testid="list-footer" aria-live="polite">
            {t('total', { amount: R(view.totalCents), ticked: tickedCount, count: keys.length })}
          </p>
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-success">
            <ListChecks className="size-5" />
          </span>
        </div>
      </div>
    </main>
  );
}
