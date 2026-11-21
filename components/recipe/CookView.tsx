/** Cook view (§7.3): hero, ingredients scaled to the household, numbered steps with timer chips. */
import { getTranslations } from 'next-intl/server';
import { Clock, Users } from 'lucide-react';
import type { CookView as Data } from '@/lib/recipes/cook';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { HeroCard } from '@/components/ui/HeroCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { TimerChip } from './TimerChip';

export async function CookView({ recipe, eyebrow, top }: { recipe: Data; eyebrow?: string; top?: React.ReactNode }) {
  const t = await getTranslations('recipe');
  return (
    <main className="space-y-4 px-gutter pt-2 pb-4">
      {top}
      <HeroCard
        titleAs="h1"
        eyebrow={eyebrow}
        title={recipe.name}
        imageUrl={recipe.imageUrl}
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-4">
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-4" />
              {t('minutes', { count: recipe.cookMinutes })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden className="size-4" />
              {t('serves', { servings: recipe.servings })}
            </span>
          </span>
        }
      />
      {recipe.description && <p className="text-text-muted">{recipe.description}</p>}
      <Card className="p-5">
        <SectionHeader title={t('ingredients')} variant="title" />
        <ul className="mt-2 divide-y divide-border">
          {recipe.ingredients.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                {i.name}
                {i.staple && (
                  <Badge tone="stale" className="ml-2 normal-case">
                    {t('staple')}
                  </Badge>
                )}
              </span>
              <span className="money shrink-0 font-semibold text-primary">{i.qty}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <SectionHeader title={t('steps')} variant="title" />
        <ol className="mt-3 space-y-4">
          {recipe.steps.map((s, k) => (
            <li key={k} className="flex gap-3">
              <span aria-hidden className="money grid size-8 shrink-0 place-items-center rounded-full bg-primary font-heading text-small font-extrabold text-on-primary">
                {k + 1}
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p>{s.text}</p>
                {s.timerMinutes !== null && <TimerChip minutes={s.timerMinutes} />}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </main>
  );
}
