import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlanFresh } from '@/lib/plans/service';
import { buildListView, whatsappText } from '@/lib/plans/list';
import { formatRand } from '@/lib/money';
import { track } from '@/lib/events';
import { ShoppingList } from '@/components/list/ShoppingList';

export const dynamic = 'force-dynamic';

export default async function ListPage() {
  const db = getDb();
  const h = await currentHousehold(db);
  const plan = h ? await latestPlanFresh(db, h.id) : null;
  if (!h || !plan) redirect('/start');
  const [view, t] = await Promise.all([buildListView(db, plan), getTranslations('list')]);
  await track(db, h.id, 'list_opened');
  const share = whatsappText(view, {
    header: t('shareHeader', { count: view.count }),
    at: (store) => t('at', { store }),
    total: t('shareTotal', { amount: formatRand(view.totalCents) }),
    noPrice: (name, needed) => t('shareNoPrice', { name, needed }),
  });
  return <ShoppingList view={view} shareText={share} />;
}
