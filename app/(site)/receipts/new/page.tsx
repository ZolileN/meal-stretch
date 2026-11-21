import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { ReceiptScan } from '@/components/receipts/ReceiptScan';
import { TopBar } from '@/components/ui/TopBar';

export const dynamic = 'force-dynamic';

export default async function NewReceipt() {
  const h = await currentHousehold(getDb());
  const t = await getTranslations('receipts');
  return (
    <main className="space-y-4 px-gutter pt-2 pb-4">
      <TopBar backHref="/savings" backLabel={t('back')} title={t('title')} />
      <ReceiptScan needsConsent={!h?.receiptConsentAt} />
    </main>
  );
}
