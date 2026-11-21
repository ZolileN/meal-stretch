import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { ReceiptScan } from '@/components/receipts/ReceiptScan';

export const dynamic = 'force-dynamic';

export default async function NewReceipt() {
  const h = await currentHousehold(getDb());
  const t = await getTranslations('receipts');
  return (
    <main className="space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <ReceiptScan needsConsent={!h?.receiptConsentAt} />
    </main>
  );
}
