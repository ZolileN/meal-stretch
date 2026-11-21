/** Household share link (ACC-3): read the plan's list and tick items. No location bar, no account needed. */
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { resolveShare } from '@/lib/share';
import { latestPlan } from '@/lib/plans/service';
import { buildListView, whatsappText } from '@/lib/plans/list';
import { formatRand } from '@/lib/money';
import { ShoppingList } from '@/components/list/ShoppingList';

export const dynamic = 'force-dynamic';

export default async function SharedList({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const [t, tl] = await Promise.all([getTranslations('shared'), getTranslations('list')]);
  const hid = await resolveShare(db, token);
  const plan = hid ? await latestPlan(db, hid) : null;
  if (!plan)
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p>{t('inactive')}</p>
      </main>
    );
  const view = await buildListView(db, plan);
  const share = whatsappText(view, { header: tl('shareHeader', { count: view.count }), at: (s) => tl('at', { store: s }), total: tl('shareTotal', { amount: formatRand(view.totalCents) }) });
  return (
    <div className="mx-auto max-w-md">
      <p className="px-4 pt-4 text-sm text-gray-600">{t('readOnly')}</p>
      <ShoppingList view={view} shareText={share} shareToken={token} />
    </div>
  );
}
