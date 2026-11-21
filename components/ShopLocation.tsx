'use client';
/**
 * O1 + O2 (PRD §7.1): where do you shop from → pick shops (+ loyalty cards).
 * Used inline during onboarding and inside the location sheet (LOC-6).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { coarsen } from '@/lib/location/geo';
import { pruneLoyalty, relevantPrograms, toggleShop, type BranchSummary, type SavedShops } from '@/lib/location/store';
import { useShops } from './location/LocationProvider';
import { ReportBranchForm } from './location/ReportBranchForm';
import { trackClient } from '@/lib/track-client';
import { Check, CirclePlus, CreditCard, LocateFixed, MapPin, Search, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Chip } from './ui/Chip';
import { EmptyState } from './ui/EmptyState';
import { SectionHeader } from './ui/SectionHeader';
import { Skeleton } from './ui/Skeleton';
import { fieldClass, labelClass } from './ui/field';

type Step = 'where' | 'shops';

interface NearbyBranch extends BranchSummary {
  distanceM: number;
  distanceLabel: string;
  walkMinutes: number | null;
  nearestOfChain: boolean;
  verified: boolean;
  suburb: string | null;
}
interface RetailerInfo {
  id: string;
  name: string;
  loyaltyProgramId: string | null;
  loyaltyProgramName: string | null;
}
type SearchResult =
  | { type: 'place'; id: string; name: string; secondary: string | null; point: { lat: number; lng: number } }
  | { type: 'google'; id: string; placeId: string; name: string; secondary: string | null };

function uuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000';
}

/** `surface` is what the picker sits on (cream page in onboarding, white inside the sheet). */
export function ShopLocation({ initialStep, onDone, surface = 'bg', onboarding = false }: { initialStep?: Step; onDone?: (s: SavedShops) => void; surface?: 'bg' | 'surface'; onboarding?: boolean }) {
  const t = useTranslations('location');
  const { shops, save } = useShops();
  const [override, setStep] = useState<Step | null>(initialStep ?? null);
  const step: Step = override ?? (shops.location ? 'shops' : 'where');

  if (step === 'where' || !shops.location) {
    return (
      <WhereStep
        eyebrow={onboarding ? t('step', { n: 1, total: 3 }) : null}
        onPicked={(location) => {
          trackClient('location_set', { source: location.source });
          save({ location });
          setStep('shops');
        }}
      />
    );
  }
  return (
    <ShopsStep
      location={shops.location}
      onChangePlace={() => setStep('where')}
      surface={surface}
      eyebrow={onboarding ? t('step', { n: 2, total: 3 }) : null}
      onDone={(s) => {
        if (s.main) trackClient('shops_set', { main_retailer: s.main.retailerId, has_top_up: Boolean(s.topUp) });
        trackClient('cards_set', { count: s.loyalty.length });
        save(s);
        onDone?.({ ...shops, ...s });
      }}
      t={t}
    />
  );
}

function WhereStep({ onPicked, eyebrow }: { onPicked: (l: NonNullable<SavedShops['location']>) => void; eyebrow: string | null }) {
  const t = useTranslations('location');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const session = useRef(uuid());

  // LOC-2: debounce 250 ms
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/location?q=${encodeURIComponent(query)}&session=${session.current}`, { signal: ctrl.signal });
        const json = (await res.json()) as { results?: SearchResult[] };
        setResults(json.results ?? []);
      } catch {
        /* aborted or offline */
      }
    }, 250);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  const useGps = () => {
    setMsg(null);
    if (!('geolocation' in navigator)) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // LOC-1: coarsen to 3 dp before the point leaves the device
        const p = coarsen({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        try {
          const res = await fetch(`/api/location?lat=${p.lat}&lng=${p.lng}`);
          if (res.status === 422) {
            setMsg(t('outsideSa'));
            inputRef.current?.focus();
            return;
          }
          const json = (await res.json()) as { label: string | null };
          onPicked({ ...p, label: json.label, source: 'gps' });
        } catch {
          setMsg(t('locationFailed'));
          inputRef.current?.focus();
        } finally {
          setBusy(false);
        }
      },
      () => {
        // Denied or timed out → search box focused, no error screen (§7.1)
        setBusy(false);
        inputRef.current?.focus();
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  };

  const pick = async (r: SearchResult) => {
    if (r.type === 'place') {
      onPicked({ ...coarsen(r.point), label: r.name, source: 'search' });
      return;
    }
    const res = await fetch(`/api/location?placeId=${encodeURIComponent(r.placeId)}&session=${session.current}`);
    session.current = uuid(); // session ends at details
    if (!res.ok) {
      setMsg(t('noResults'));
      return;
    }
    const json = (await res.json()) as { point: { lat: number; lng: number }; label: string | null };
    onPicked({ ...json.point, label: json.label ?? r.name, source: 'google' });
  };

  return (
    <section aria-labelledby={`${inputId}-h`} className="space-y-5">
      {eyebrow && <p className="-mb-4 text-caption font-bold tracking-wider text-accent uppercase">{eyebrow}</p>}
      <h2 id={`${inputId}-h`} className="font-heading text-display font-extrabold text-primary">
        {t('whereTitle')}
      </h2>
      <Button size="lg" onClick={useGps} loading={busy} loadingLabel={t('locating')} icon={<LocateFixed aria-hidden className="size-5" />}>
        {t('useMyLocation')}
      </Button>
      <div className="space-y-1.5">
        <label htmlFor={inputId} className={labelClass}>
          {t('searchLabel')}
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-text-muted" />
          <input
            id={inputId}
            ref={inputRef}
            type="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={cn(fieldClass, 'pl-12')}
          />
        </div>
      </div>
      {msg && (
        <p role="status" className="rounded-input bg-danger-soft px-4 py-3 text-small text-danger">
          {msg}
        </p>
      )}
      {results && q.trim().length >= 2 && (
        <Card as="div" className="overflow-hidden">
          <ul className="divide-y divide-border" aria-label={t('searchLabel')}>
            {results.length === 0 && <li className="p-4 text-small text-text-muted">{t('noResults')}</li>}
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => pick(r)} className="press tap flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted">
                  <MapPin aria-hidden className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.name}</span>
                    {r.secondary && <span className="block text-small text-text-muted">{r.secondary}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function ShopsStep({
  location,
  onChangePlace,
  onDone,
  t,
  surface,
  eyebrow,
}: {
  surface: 'bg' | 'surface';
  eyebrow: string | null;
  location: NonNullable<SavedShops['location']>;
  onChangePlace: () => void;
  onDone: (s: Pick<SavedShops, 'main' | 'topUp' | 'loyalty'>) => void;
  t: ReturnType<typeof useTranslations<'location'>>;
}) {
  const { shops } = useShops();
  const [data, setData] = useState<{ radiusKm: number; branches: NearbyBranch[]; retailers: RetailerInfo[] } | null>(null);
  const [sel, setSel] = useState<Pick<SavedShops, 'main' | 'topUp'>>({ main: shops.main, topUp: shops.topUp });
  const [loyalty, setLoyalty] = useState<string[]>(shops.loyalty);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/stores/nearby?lat=${location.lat}&lng=${location.lng}`);
    if (res.ok) setData(await res.json());
    else setData({ radiusKm: 50, branches: [], retailers: [] });
  }, [location.lat, location.lng]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const programs = data ? relevantPrograms(sel, data.retailers) : [];
  const role = (id: number) => (sel.main?.branchId === id ? 'main' : sel.topUp?.branchId === id ? 'topUp' : null);
  const summary = (b: NearbyBranch): BranchSummary => ({
    branchId: b.branchId,
    retailerId: b.retailerId,
    retailerName: b.retailerName,
    branchName: b.branchName,
    distanceM: b.distanceM,
  });
  const chips = data?.branches.filter((b) => b.nearestOfChain) ?? [];

  const BranchButton = ({ b, compact }: { b: NearbyBranch; compact?: boolean }) => {
    const r = role(b.branchId);
    return (
      <button
        type="button"
        aria-pressed={r !== null}
        onClick={() => setSel((s) => toggleShop(s, summary(b)))}
        className={cn(
          'press tap flex items-center gap-3 border text-left',
          compact ? 'rounded-pill px-4 py-2' : 'w-full rounded-card px-4 py-3 shadow-card',
          r ? 'border-primary bg-surface-muted' : 'border-border bg-surface hover:border-primary-soft',
        )}
      >
        {!compact && (
          <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-full', r ? 'bg-primary text-on-primary' : 'bg-surface-muted text-primary')}>
            {r ? <Check className="size-5" strokeWidth={2.5} /> : <Store className="size-5" />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn('block font-semibold', r ? 'text-primary' : 'text-text', compact && 'text-small')}>{compact ? b.retailerName : b.branchName}</span>
          <span className="block text-caption text-text-muted">
            {b.distanceLabel}
            {b.walkMinutes !== null && ` · ${t('walk', { minutes: b.walkMinutes })}`}
            {!compact && !b.verified && ` · ${t('unverified')}`}
          </span>
        </span>
        {r && (
          <Badge tone="active" className="shrink-0">
            {r === 'main' ? t('mainBadge') : t('topUpBadge')}
          </Badge>
        )}
      </button>
    );
  };

  return (
    <section className="space-y-5" aria-labelledby="shops-h">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-small font-medium text-text-muted">
          <MapPin aria-hidden className="size-4 text-primary" />
          {t('near', { place: location.label ?? t('unknownPlace') })}
        </p>
        <Button variant="ghost" onClick={onChangePlace} className="-mr-3">
          {t('changePlace')}
        </Button>
      </div>
      <div>
        {eyebrow && <p className="mb-1 text-caption font-bold tracking-wider text-accent uppercase">{eyebrow}</p>}
        <h2 id="shops-h" className="font-heading text-display font-extrabold text-primary">
          {t('shopsTitle')}
        </h2>
        <p className="mt-1 text-small text-text-muted">{t('shopsHelp')}</p>
      </div>
      {!data && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only">{t('loading')}</span>
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      )}
      {data && data.branches.length === 0 && <EmptyState icon={<Store className="size-6" />} title={t('noStores', { km: data.radiusKm })} />}
      {chips.length > 0 && (
        <div className="space-y-2">
          <SectionHeader as="h3" title={t('nearestChains')} />
          <div className="flex flex-wrap gap-2">
            {chips.map((b) => (
              <BranchButton key={b.branchId} b={b} compact />
            ))}
          </div>
        </div>
      )}
      {data && data.branches.length > 0 && (
        <div className="space-y-2">
          <SectionHeader as="h3" title={`${t('allStores')} · ${t('within', { km: data.radiusKm })}`} />
          <ul className="space-y-2">
            {data.branches.map((b) => (
              <li key={b.branchId}>
                <BranchButton b={b} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {programs.length > 0 && (
        <Card as="div" className="space-y-3 p-5">
          <h3 className="inline-flex items-center gap-2 font-heading text-h3 font-bold text-primary">
            <CreditCard aria-hidden className="size-5" />
            {t('cardsTitle')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {programs.map((p) => {
              const on = loyalty.includes(p.id);
              return (
                <Chip key={p.id} selected={on} onClick={() => setLoyalty((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))}>
                  {p.name} · {t('cardHave')}
                </Chip>
              );
            })}
          </div>
        </Card>
      )}
      <div className="space-y-2 border-t border-border pt-4 text-small">
        {reporting ? (
          <ReportBranchForm point={location} retailers={data?.retailers ?? []} onClose={() => setReporting(false)} />
        ) : (
          <Button variant="ghost" onClick={() => setReporting(true)} className="-ml-3" icon={<CirclePlus aria-hidden className="size-4" />}>
            {t('reportLink')}
          </Button>
        )}
        <p className="text-caption text-text-muted">{t('osmAttribution')}</p>
      </div>
      <div className={cn('pb-safe sticky bottom-0 -mx-gutter bg-gradient-to-t px-gutter pt-4', surface === 'bg' ? 'from-bg via-bg to-bg/0' : 'from-surface via-surface to-surface/0')}>
        <Button size="lg" disabled={!sel.main} onClick={() => onDone({ ...sel, loyalty: pruneLoyalty(loyalty, programs) })}>
          {t('continue')}
        </Button>
      </div>
    </section>
  );
}
