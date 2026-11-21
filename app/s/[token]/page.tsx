/** Household share link (ACC-3): read the plan's list and tick items. No location bar, no account needed. */
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { resolveShare } from '@/lib/share';
import { latestPlan } from '@/lib/plans/service';
import { buildListView, whatsappText } from '@/lib/plans/list';
import { formatRand } from '@/lib/money';
import { ShoppingList } from '@/components/list/ShoppingList';
import { Wordmark } from '@/components/ui/Wordmark';

export const dynamic = 'force-dynamic';

export default async function SharedList({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const [t, tl] = await Promise.all([getTranslations('shared'), getTranslations('list')]);
  const hid = await resolveShare(db, token);
  const plan = hid ? await latestPlan(db, hid) : null;
  if (!plan)
    return (
      <main className="mx-auto max-w-md space-y-6 px-gutter py-10">
        <Wordmark />
        <p className="rounded-card border border-border bg-surface p-5 shadow-card">{t('inactive')}</p>
      </main>
    );
  const view = await buildListView(db, plan);
  const share = whatsappText(view, { header: tl('shareHeader', { count: view.count }), at: (s) => tl('at', { store: s }), total: tl('shareTotal', { amount: formatRand(view.totalCents) }) });
  return (
    <div className="mx-auto max-w-md">
      <div className="space-y-2 px-gutter pt-4 pb-2">
        <Wordmark />
        <p className="text-small text-text-muted">{t('readOnly')}</p>
      </div>
      <ShoppingList view={view} shareText={share} shareToken={token} />
    </div>
  );
}
