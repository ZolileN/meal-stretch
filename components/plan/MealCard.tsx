'use client';
/** Meal card (THEME §3): day, name (2 lines max), cost per plate, time, optional thumbnail, actions. */
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { dayMonth, weekdayShort } from '@/lib/dates';
import { formatRandShort } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { PlanView } from '@/lib/plans/view';
import { Card } from '@/components/ui/Card';
import { useImagesAllowed } from '@/components/ui/useImagesAllowed';
import { MealActions } from './MealActions';

type Meal = PlanView['meals'][number];

export function MealCard({ meal, planId, editable, tonight, onNotice }: { meal: Meal; planId: string; editable: boolean; tonight?: boolean; onNotice: (m: string) => void }) {
  const t = useTranslations('plan');
  const locale = useLocale();
  const photos = useImagesAllowed();
  const day = `${weekdayShort(meal.date, locale)} ${dayMonth(meal.date, locale)}`;
  return (
    <Card as="li" className={cn('p-4', tonight && 'border-primary-soft')} data-testid={`meal-${meal.day}`}>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn('text-caption font-bold tracking-wide uppercase', tonight ? 'text-accent' : 'text-text-muted')}>{tonight ? `${t('tonight')} · ${day}` : day}</p>
          <h3 className="mt-0.5 line-clamp-2 font-heading text-h3 font-bold text-primary">
            <Link href={`/recipe/${meal.recipeId}`} className="hover:underline">
              {meal.name}
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-small">
            <span className="money font-bold text-text">{t('perPlate', { amount: formatRandShort(meal.perPlateCents) })}</span>
            <span className="inline-flex items-center gap-1 text-text-muted">
              <Clock aria-hidden className="size-4" />
              {t('minutes', { count: meal.cookMinutes })}
            </span>
          </p>
          {meal.share && <p className="mt-0.5 text-caption text-text-muted">{t('shareHint', meal.share)}</p>}
        </div>
        {photos && meal.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- decorative ≤40 KB thumbnail, only when photos are allowed
          <img src={meal.imageUrl} alt="" loading="lazy" decoding="async" width={72} height={72} className="size-18 shrink-0 rounded-img bg-surface-muted object-cover" />
        )}
      </div>
      {editable && <MealActions planId={planId} day={meal.day} name={meal.name} onNotice={onNotice} />}
    </Card>
  );
}
