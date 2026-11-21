/** S1 savings (PRD §7.5): lifetime total (only goes up), breakdown, receipt CTA. */
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/lib/brand';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { formatRandShort } from '@/lib/money';
import { lifetimeSavings } from '@/lib/savings';

export const dynamic = 'force-dynamic';

export default async function SavingsPage() {
  const db = getDb();
  const h = await currentHousehold(db);
  const s = h ? await lifetimeSavings(db, h.id) : null;
  const t = await getTranslations('savings');
  const R = formatRandShort;
  return (
    <main className="space-y-4 px-4 py-6">
      <h1 className="sr-only">{t('title')}</h1>
      <section className="rounded-2xl bg-brand p-6 text-white" data-testid="lifetime">
        <p className="text-3xl font-bold">{t('lifetime', { amount: R(s?.totalCents ?? 0), brand: BRAND.name })}</p>
        {s && <p className="mt-1 text-sm opacity-90">{t('counts', { plans: s.shoppedPlans, receipts: s.verifiedReceipts })}</p>}
      </section>
      {!s || s.totalCents === 0 ? (
        <p>{t('nothingYet')}</p>
      ) : (
        <dl className="divide-y rounded-2xl border">
          <Row label={t('specials')} value={R(s.specialsCents)} />
          <Row label={t('cards')} value={R(s.memberCents)} />
          <Row label={t('verified')} value={R(s.verifiedCents)} />
        </dl>
      )}
      {s && s.packEfficiencyCents > 0 && <p className="text-sm text-gray-700">{t('packSharing', { amount: R(s.packEfficiencyCents) })}</p>}
      <p className="text-xs text-gray-600">{t('howCounted')}</p>
      <Link href="/receipts/new" className="tap flex items-center justify-center rounded-xl bg-brand px-4 py-3 font-semibold text-white">
        {t('scan')}
      </Link>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3">
      <dt>{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
