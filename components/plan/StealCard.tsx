/** Steal of the week on the amber-soft background (THEME §3). */
import { useLocale, useTranslations } from 'next-intl';
import { Tag } from 'lucide-react';
import { dayMonth } from '@/lib/dates';
import { formatRandShort } from '@/lib/money';
import type { PlanView } from '@/lib/plans/view';
import { Card } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/MoneyText';

export function StealCard({ steal }: { steal: NonNullable<PlanView['steal']> }) {
  const t = useTranslations('steal');
  const locale = useLocale();
  return (
    <Card tone="savings" bordered={false} className="p-5" data-testid="steal">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-savings text-on-primary">
          <Tag className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-caption font-bold tracking-wider text-savings-text uppercase">{t('title')}</h2>
          <p className="mt-1 font-semibold text-text">
            {t('line', { product: steal.productName, pack: steal.pack, price: formatRandShort(steal.specialCents), store: steal.retailerName })}
          </p>
          <p className="money mt-1 text-small text-text-muted">
            <MoneyText cents={steal.normalCents} strike strikeLabel={t('wasLabel')} /> <span className="font-semibold text-savings-text">−{steal.pct}%</span>
            {steal.lowestInWeeks && ` · ${t('lowest', { weeks: steal.lowestInWeeks })}`}
            {steal.endsOn && ` · ${t('ends', { date: dayMonth(steal.endsOn, locale) })}`}
          </p>
        </div>
      </div>
    </Card>
  );
}
