import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/lib/brand';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlan } from '@/lib/plans/service';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const t = await getTranslations('home');
  // The plan is the home screen once one exists (§7.2).
  const db = getDb();
  const h = await currentHousehold(db).catch(() => null);
  if (h && (await latestPlan(db, h.id))) redirect('/plan');
  return (
    <main className="px-4 py-10">
      <p className="text-sm font-semibold text-brand">{BRAND.name}</p>
      <h1 className="mt-2 text-3xl font-bold">{t('headline')}</h1>
      <p className="mt-3 text-gray-700">{t('intro')}</p>
      <Link href="/start" className="tap mt-6 flex items-center justify-center rounded-xl bg-brand px-4 py-3 font-semibold text-white">
        {t('start')}
      </Link>
      <p className="mt-6 text-sm text-gray-500">{BRAND.tagline}</p>
    </main>
  );
}
