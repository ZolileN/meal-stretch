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

export function ShopLocation({ initialStep, onDone }: { initialStep?: Step; onDone?: (s: SavedShops) => void }) {
  const t = useTranslations('location');
  const { shops, save } = useShops();
  const [override, setStep] = useState<Step | null>(initialStep ?? null);
  const step: Step = override ?? (shops.location ? 'shops' : 'where');

  if (step === 'where' || !shops.location) {
    return (
      <WhereStep
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

function WhereStep({ onPicked }: { onPicked: (l: NonNullable<SavedShops['location']>) => void }) {
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
    <section aria-labelledby={`${inputId}-h`} className="space-y-4">
      <h2 id={`${inputId}-h`} className="text-xl font-bold">
        {t('whereTitle')}
      </h2>
      <button type="button" onClick={useGps} disabled={busy} className="tap w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60">
        {busy ? t('locating') : t('useMyLocation')}
      </button>
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
          {t('searchLabel')}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="tap mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-base"
        />
      </div>
      {msg && (
        <p role="status" className="text-sm text-danger">
          {msg}
        </p>
      )}
      {results && q.trim().length >= 2 && (
        <ul className="divide-y rounded-xl border" aria-label={t('searchLabel')}>
          {results.length === 0 && <li className="p-3 text-sm text-gray-600">{t('noResults')}</li>}
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => pick(r)} className="tap w-full px-4 py-3 text-left">
                <span className="font-medium">{r.name}</span>
                {r.secondary && <span className="block text-sm text-gray-600">{r.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ShopsStep({
  location,
  onChangePlace,
  onDone,
  t,
}: {
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
        className={`tap rounded-xl border px-3 py-2 text-left ${r ? 'border-brand bg-teal-50' : 'border-gray-300'} ${compact ? '' : 'w-full'}`}
      >
        <span className="font-medium">{compact ? b.retailerName : b.branchName}</span>
        <span className="block text-sm text-gray-600">
          {b.distanceLabel}
          {b.walkMinutes !== null && ` · ${t('walk', { minutes: b.walkMinutes })}`}
          {!compact && !b.verified && ` · ${t('unverified')}`}
        </span>
        {r && <span className="mt-1 inline-block rounded bg-brand px-2 text-xs font-semibold text-white">{r === 'main' ? t('mainBadge') : t('topUpBadge')}</span>}
      </button>
    );
  };

  return (
    <section className="space-y-4" aria-labelledby="shops-h">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-700">{t('near', { place: location.label ?? t('unknownPlace') })}</p>
        <button type="button" onClick={onChangePlace} className="tap text-sm font-semibold text-brand underline">
          {t('changePlace')}
        </button>
      </div>
      <h2 id="shops-h" className="text-xl font-bold">
        {t('shopsTitle')}
      </h2>
      <p className="text-sm text-gray-600">{t('shopsHelp')}</p>
      {!data && <p className="text-sm text-gray-600">{t('loading')}</p>}
      {data && data.branches.length === 0 && <p className="text-sm">{t('noStores', { km: data.radiusKm })}</p>}
      {chips.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700">{t('nearestChains')}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((b) => (
              <BranchButton key={b.branchId} b={b} compact />
            ))}
          </div>
        </div>
      )}
      {data && data.branches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            {t('allStores')} · {t('within', { km: data.radiusKm })}
          </h3>
          <ul className="mt-2 space-y-2">
            {data.branches.map((b) => (
              <li key={b.branchId}>
                <BranchButton b={b} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {programs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700">{t('cardsTitle')}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {programs.map((p) => {
              const on = loyalty.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLoyalty((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                  className={`tap rounded-full border px-4 py-2 text-sm ${on ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}
                >
                  {p.name} · {t('cardHave')}
                  {on && ' ✓'}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={!sel.main}
        onClick={() => onDone({ ...sel, loyalty: pruneLoyalty(loyalty, programs) })}
        className="tap w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {t('continue')}
      </button>
      <div className="space-y-2 border-t pt-3 text-sm">
        {reporting ? (
          <ReportBranchForm point={location} retailers={data?.retailers ?? []} onClose={() => setReporting(false)} />
        ) : (
          <button type="button" onClick={() => setReporting(true)} className="tap font-semibold text-brand underline">
            {t('reportLink')}
          </button>
        )}
        <p className="text-xs text-gray-500">{t('osmAttribution')}</p>
      </div>
    </section>
  );
}
