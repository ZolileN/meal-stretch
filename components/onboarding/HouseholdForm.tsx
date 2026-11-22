'use client';
/** O3 (PRD §7.1): people, optional portion styles, budget, until when, quick avoid list. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { Stepper } from '@/components/Stepper';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { TopBar } from '@/components/ui/TopBar';
import { fieldClass } from '@/components/ui/field';
import { useShops } from '@/components/location/LocationProvider';
import { addDaysIso, DEFAULT_PAYDAY, isoDateInSA, periodDays, type PeriodChoice } from '@/lib/period';

const AVOID = ['pork', 'beef', 'fish', 'shellfish', 'nuts', 'dairy', 'gluten'] as const;
const avoidKey = { pork: 'avoidPork', beef: 'avoidBeef', fish: 'avoidFish', shellfish: 'avoidShellfish', nuts: 'avoidNuts', dairy: 'avoidDairy', gluten: 'avoidGluten' } as const;

/** Starting values for a returning household (a new plan starts from the last one's people, budget and avoid list). */
export interface HouseholdDefaults {
  light: number;
  average: number;
  big: number;
  budgetRands: number | null;
  avoid: string[];
}

export function HouseholdForm({ paydayDom = DEFAULT_PAYDAY, defaults }: { paydayDom?: number; defaults?: HouseholdDefaults }) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const { shops } = useShops();
  const today = useMemo(() => isoDateInSA(new Date()), []);
  const total = defaults ? defaults.light + defaults.average + defaults.big : 0;
  const [people, setPeople] = useState(total > 0 ? Math.min(total, 12) : 1);
  const [split, setSplit] = useState<{ light: number; big: number } | null>(
    defaults && (defaults.light > 0 || defaults.big > 0) ? { light: defaults.light, big: defaults.big } : null,
  );
  const [budget, setBudget] = useState(defaults?.budgetRands ? String(defaults.budgetRands) : '');
  const [choice, setChoice] = useState<PeriodChoice>({ kind: 'week' });
  const [date, setDate] = useState(addDaysIso(today, 6));
  const [avoid, setAvoid] = useState<string[]>(() => (defaults?.avoid ?? []).filter((a) => (AVOID as readonly string[]).includes(a)));
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
    <form onSubmit={submit} className="space-y-3" noValidate>
      <TopBar backHref="/start" backLabel={t('back')} />
      <div className="pt-2 pb-1">
        <p className="text-caption font-bold tracking-wider text-accent uppercase">{t('step', { n: 3, total: 3 })}</p>
        <h1 className="mt-1 font-heading text-display font-extrabold text-primary">{t('title')}</h1>
      </div>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-h3 font-bold text-primary">{t('people')}</h2>
          <Stepper value={people} min={1} max={12} onChange={setPeople} label={t('people')} decLabel={t('fewer')} incLabel={t('more')} />
        </div>
        <Button variant="ghost" className="-ml-3" aria-expanded={split !== null} onClick={() => setSplit(split ? null : { light: 0, big: 0 })}>
          {t('someEatMore')}
        </Button>
        {split && (
          <div className="space-y-2 rounded-input bg-surface-muted p-4">
            <Row label={t('light')}>
              <Stepper value={light} min={0} max={people - big} onChange={(v) => setSplit({ light: v, big })} label={t('light')} decLabel={t('fewer')} incLabel={t('more')} />
            </Row>
            <Row label={t('average')}>
              <output className="money min-w-8 text-center font-heading text-h1 font-extrabold text-primary">{average}</output>
            </Row>
            <Row label={t('big')}>
              <Stepper value={big} min={0} max={people - light} onChange={(v) => setSplit({ light, big: v })} label={t('big')} decLabel={t('fewer')} incLabel={t('more')} />
            </Row>
          </div>
        )}
      </Card>

      <Card className="space-y-2 p-5">
        <label htmlFor="budget" className="block font-heading text-h3 font-bold text-primary">
          {t('budget')}
        </label>
        <div className="flex items-center rounded-input border border-border bg-surface px-4 focus-within:border-primary-soft focus-within:outline-2 focus-within:outline-primary-soft">
          <span aria-hidden className="font-heading text-h1 font-extrabold text-primary">
            R
          </span>
          <input
            id="budget"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="tap money w-full bg-transparent px-2 py-3 font-heading text-h1 font-extrabold text-text outline-none"
            aria-describedby="budget-help"
          />
        </div>
        <p id="budget-help" className="text-small text-text-muted">
          {t('budgetHelp')}
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-heading text-h3 font-bold text-primary">{t('until')}</h2>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Chip key={o.key} selected={choice.kind === o.key} onClick={() => setChoice(o.choice)}>
              {o.label}
            </Chip>
          ))}
          <Chip selected={choice.kind === 'date'} onClick={() => setChoice({ kind: 'date', date })}>
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
            className={fieldClass}
          />
        )}
        <p className="flex items-center gap-2 text-small font-medium text-text" aria-live="polite">
          <CalendarDays aria-hidden className="size-4 text-primary" />
          {t('daysCount', { count: days })}
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-heading text-h3 font-bold text-primary">{t('avoid')}</h2>
        <div className="flex flex-wrap gap-2">
          {AVOID.map((a) => (
            <Chip key={a} selected={avoid.includes(a)} onClick={() => setAvoid((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>
              {t(avoidKey[a])}
            </Chip>
          ))}
        </div>
      </Card>

      {state.error && (
        <p role="alert" className="rounded-input bg-danger-soft px-4 py-3 text-small font-semibold text-danger">
          {state.error}
        </p>
      )}
      <div className="pb-safe sticky bottom-0 -mx-gutter bg-gradient-to-t from-bg via-bg to-bg/0 px-gutter pt-4">
        <Button type="submit" size="lg" loading={state.busy} loadingLabel={t('planning')}>
          {t('cta')}
        </Button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  );
}
