/** S1 savings (PRD §7.5): lifetime total in savings amber (only goes up), ring, breakdown, receipt CTA. */
import { getTranslations } from 'next-intl/server';
import { BadgePercent, Camera, CreditCard, Package, PiggyBank, ReceiptText } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { formatRandShort } from '@/lib/money';
import type { Lifetime } from '@/lib/savings';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatRing } from '@/components/ui/StatRing';

export async function SavingsView({ s }: { s: Lifetime | null }) {
  const t = await getTranslations('savings');
  const R = formatRandShort;
  const none = !s || s.totalCents === 0;
  const rows = s
    ? [
        { Icon: BadgePercent, label: t('specials'), cents: s.specialsCents },
        { Icon: CreditCard, label: t('cards'), cents: s.memberCents },
        { Icon: ReceiptText, label: t('verified'), cents: s.verifiedCents },
      ]
    : [];
  return (
    <main className="space-y-3 px-gutter pt-2 pb-4">
      <h1 className="font-heading text-h1 font-extrabold text-primary">{t('title')}</h1>
      <Card tone="savings" bordered={false} className="flex flex-wrap items-center gap-4 p-5" data-testid="lifetime">
        <div className="min-w-0 flex-1 basis-40">
          <p aria-hidden className="money font-heading text-display font-extrabold [overflow-wrap:anywhere] text-savings-text">
            {R(s?.totalCents ?? 0)}
          </p>
          <p className="mt-1 font-semibold text-text">{t('lifetime', { amount: R(s?.totalCents ?? 0), brand: BRAND.name })}</p>
          {s && <p className="mt-1 text-small text-text-muted">{t('counts', { plans: s.shoppedPlans, receipts: s.verifiedReceipts })}</p>}
        </div>
        {s && s.shoppedPlans > 0 && <StatRing pct={s.planRatePct} label={t('ringLabel', { pct: s.planRatePct })} />}
      </Card>
      {none ? (
        <EmptyState icon={<PiggyBank className="size-6" />} title={t('nothingYetTitle')} text={t('nothingYet')} />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ Icon, label, cents }) => (
            <Card as="li" key={label} className="flex items-center gap-3 px-5 py-4">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-savings-soft text-savings-text">
                <Icon className="size-5" />
              </span>
              <span className="flex-1 font-medium">{label}</span>
              <span className="money font-heading text-h3 font-extrabold text-savings-text">{R(cents)}</span>
            </Card>
          ))}
        </ul>
      )}
      {s && s.packEfficiencyCents > 0 && (
        <p className="flex items-start gap-2 text-small text-text-muted">
          <Package aria-hidden className="mt-0.5 size-4 shrink-0 stroke-savings" />
          {t('packSharing', { amount: R(s.packEfficiencyCents) })}
        </p>
      )}
      <p className="text-caption text-text-muted">{t('howCounted')}</p>
      <ButtonLink href="/receipts/new" size="lg" icon={<Camera aria-hidden className="size-5" />}>
        {t('scan')}
      </ButtonLink>
    </main>
  );
}
