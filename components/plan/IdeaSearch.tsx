'use client';
/** "What do you feel like?" → recipes from our catalogue, picked by Claude and priced by the engine for this day. */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Search, Sparkles } from 'lucide-react';
import { formatRandShort } from '@/lib/money';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SavingsChip } from '@/components/ui/SavingsChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { fieldClass } from '@/components/ui/field';

interface Idea {
  recipeId: string;
  name: string;
  cookMinutes: number;
  cuisine: string | null;
  perPlateCents: number;
  deltaCents: number;
  unpriced: number;
}

const CHIPS = ['chip15', 'chipMeatFree', 'chipItalian', 'chipCurry', 'chipChinese', 'chipKids'] as const;
const CUISINES = ['south_african', 'afrikaans', 'cape_malay', 'indian', 'portuguese', 'italian', 'chinese', 'mexican', 'american', 'british', 'greek', 'middle_eastern', 'thai', 'spanish'] as const;

export function IdeaSearch({ planId, day, busy, onChoose, autoFocus = false }: { planId: string; day: number; busy: boolean; onChoose: (recipeId: string) => void; autoFocus?: boolean }) {
  const t = useTranslations('ideas');
  const ta = useTranslations('actions');
  const tp = useTranslations('plan');
  const [text, setText] = useState('');
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; ideas: Idea[]; message?: string }>({ status: 'idle', ideas: [] });
  const R = (c: number) => formatRandShort(c);

  const ask = async (q: string) => {
    if (q.trim().length < 2) return;
    setText(q);
    setState({ status: 'loading', ideas: [] });
    const res = await fetch(`/api/plans/${planId}/ideas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day, text: q }) }).catch(() => null);
    if (!res?.ok) return setState({ status: 'error', ideas: [], message: res?.status === 429 ? t('cap') : t('failed') });
    const j = (await res.json()) as { options: Idea[] };
    setState({ status: 'done', ideas: j.options, message: j.options.length ? undefined : t('none') });
  };
  const cuisineLabel = (c: string | null) => (c && (CUISINES as readonly string[]).includes(c) ? t(`cuisine.${c as (typeof CUISINES)[number]}`) : null);

  return (
    <section className="space-y-3" aria-labelledby="ideas-h" data-testid="idea-search">
      <h3 id="ideas-h" className="flex items-center gap-2 font-heading text-h3 font-bold text-primary">
        <Sparkles aria-hidden className="size-5 stroke-savings" />
        {t('title')}
      </h3>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <label htmlFor="idea-text" className="sr-only">
          {t('label')}
        </label>
        <input id="idea-text" value={text} maxLength={300} autoFocus={autoFocus} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} className={fieldClass} />
        <Button type="submit" aria-label={t('submit')} loading={state.status === 'loading'} className="shrink-0">
          <Search aria-hidden className="size-5" />
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((k) => (
          <Chip key={k} selected={text === t(k)} onClick={() => void ask(t(k))}>
            {t(k)}
          </Chip>
        ))}
      </div>
      {state.status === 'loading' && (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only">{t('working')}</span>
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
      )}
      {state.message && (
        <p role="status" className={state.status === 'error' ? 'text-small text-danger' : 'text-small text-text-muted'}>
          {state.message}
        </p>
      )}
      {state.ideas.length > 0 && (
        <ul className="space-y-2" aria-label={t('results')}>
          {state.ideas.map((o) => (
            <li key={o.recipeId} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4" data-testid="idea-option">
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-semibold text-primary">{o.name}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-text-muted">
                  <span className="money font-semibold text-text">{tp('perPlate', { amount: R(o.perPlateCents) })}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock aria-hidden className="size-4" />
                    {tp('minutes', { count: o.cookMinutes })}
                  </span>
                  {cuisineLabel(o.cuisine) && <Badge tone="stale" className="normal-case">{cuisineLabel(o.cuisine)}</Badge>}
                </span>
                {o.deltaCents < 0 ? (
                  <SavingsChip>{ta('deltaCheaper', { amount: R(-o.deltaCents) })}</SavingsChip>
                ) : (
                  <span className={`money block text-small font-semibold ${o.deltaCents > 0 ? 'text-danger' : 'text-text-muted'}`}>
                    {o.deltaCents > 0 ? ta('deltaMore', { amount: R(o.deltaCents) }) : ta('deltaSame')}
                  </span>
                )}
                {o.unpriced > 0 && <span className="block text-caption text-text-muted">{t('unpriced', { count: o.unpriced })}</span>}
              </span>
              <Button disabled={busy} onClick={() => onChoose(o.recipeId)}>
                {ta('choose')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-text-muted">{t('footnote')}</p>
    </section>
  );
}
