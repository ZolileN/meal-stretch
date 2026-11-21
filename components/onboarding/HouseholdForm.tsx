'use client';
/** O3 (PRD §7.1): people, optional portion styles, budget, until when, quick avoid list. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Stepper } from '@/components/Stepper';
import { useShops } from '@/components/location/LocationProvider';
import { addDaysIso, DEFAULT_PAYDAY, isoDateInSA, periodDays, type PeriodChoice } from '@/lib/period';

const AVOID = ['pork', 'beef', 'fish', 'nuts', 'dairy', 'gluten'] as const;
const avoidKey = { pork: 'avoidPork', beef: 'avoidBeef', fish: 'avoidFish', nuts: 'avoidNuts', dairy: 'avoidDairy', gluten: 'avoidGluten' } as const;

export function HouseholdForm({ paydayDom = DEFAULT_PAYDAY }: { paydayDom?: number }) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const { shops } = useShops();
  const today = useMemo(() => isoDateInSA(new Date()), []);
  const [people, setPeople] = useState(1);
  const [split, setSplit] = useState<{ light: number; big: number } | null>(null);
  const [budget, setBudget] = useState('');
  const [choice, setChoice] = useState<PeriodChoice>({ kind: 'week' });
  const [date, setDate] = useState(addDaysIso(today, 6));
  const [avoid, setAvoid] = useState<string[]>([]);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const light = split ? Math.min(split.light, people) : 0;
  const big = split ? Math.min(split.big, people - light) : 0;
  const average = people - light - big;

  const options: { key: string; choice: PeriodChoice; label: string }[] = [
    { key: 'week', choice: { kind: 'week' }, label: t('week') },
    { key: 'payday', choice: { kind: 'payday' }, label: t('payday', { day: paydayDom }) },
    { key: 'monthEnd', choice: { kind: 'monthEnd' }, label: t('monthEnd') },
  ];
  const effective: PeriodChoice = choice.kind === 'date' ? { kind: 'date', date } : choice;
  const days = periodDays(effective, today, paydayDom).days;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rands = Number(budget);
    if (!shops.main) return setState({ busy: false, error: t('needShops') });
    if (!/^\d+$/.test(budget) || rands <= 0) return setState({ busy: false, error: t('needBudget') });
    setState({ busy: true, error: null });
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        household: { light, average, big },
        shops: { mainBranchId: shops.main.branchId, topUpBranchId: shops.topUp?.branchId ?? null },
        loyalty: shops.loyalty,
        exclusions: avoid,
        period: effective,
        budgetRands: rands,
      }),
    }).catch(() => null);
    if (res?.ok) {
      router.push('/plan');
      router.refresh();
      return;
    }
    const code = res ? ((await res.json().catch(() => ({}))) as { error?: { code?: string } }).error?.code : null;
    setState({ busy: false, error: code === 'no_recipes' ? t('noRecipes') : code === 'no_shops' ? t('needShops') : t('failed') });
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <h1 className="text-xl font-bold">{t('title')}</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">{t('people')}</h2>
        <Stepper value={people} min={1} max={12} onChange={setPeople} label={t('people')} decLabel={t('fewer')} incLabel={t('more')} />
        <button type="button" className="tap text-sm font-semibold text-brand underline" aria-expanded={split !== null} onClick={() => setSplit(split ? null : { light: 0, big: 0 })}>
          {t('someEatMore')}
        </button>
        {split && (
          <div className="space-y-2 rounded-xl border p-3">
            <Row label={t('light')}>
              <Stepper value={light} min={0} max={people - big} onChange={(v) => setSplit({ light: v, big })} label={t('light')} decLabel={t('fewer')} incLabel={t('more')} />
            </Row>
            <Row label={t('average')}>
              <output className="text-2xl font-bold">{average}</output>
            </Row>
            <Row label={t('big')}>
              <Stepper value={big} min={0} max={people - light} onChange={(v) => setSplit({ light, big: v })} label={t('big')} decLabel={t('fewer')} incLabel={t('more')} />
            </Row>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <label htmlFor="budget" className="block font-semibold">
          {t('budget')}
        </label>
        <div className="flex items-center rounded-xl border px-3">
          <span aria-hidden className="text-xl font-bold">R</span>
          <input
            id="budget"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="tap w-full px-2 py-3 text-xl font-bold outline-none"
            aria-describedby="budget-help"
          />
        </div>
        <p id="budget-help" className="text-sm text-gray-600">
          {t('budgetHelp')}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t('until')}</h2>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Chip key={o.key} on={choice.kind === o.key} onClick={() => setChoice(o.choice)}>
              {o.label}
            </Chip>
          ))}
          <Chip on={choice.kind === 'date'} onClick={() => setChoice({ kind: 'date', date })}>
            {t('pickDate')}
          </Chip>
        </div>
        {choice.kind === 'date' && (
          <input
            type="date"
            aria-label={t('pickDate')}
            min={addDaysIso(today, 2)}
            max={addDaysIso(today, 13)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="tap rounded-xl border px-3"
          />
        )}
        <p className="text-sm text-gray-700" aria-live="polite">
          {t('daysCount', { count: days })}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t('avoid')}</h2>
        <div className="flex flex-wrap gap-2">
          {AVOID.map((a) => (
            <Chip key={a} on={avoid.includes(a)} onClick={() => setAvoid((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>
              {t(avoidKey[a])}
            </Chip>
          ))}
        </div>
      </section>

      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={state.busy} className="tap w-full rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-white disabled:opacity-60">
        {state.busy ? t('planning') : t('cta')}
      </button>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`tap rounded-full border px-4 py-2 text-sm ${on ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}>
      {children}
    </button>
  );
}
