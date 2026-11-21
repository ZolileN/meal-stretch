import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { openReports } from '@/lib/admin/reports';
import { unmatchedQueue } from '@/lib/leaflets';

export default async function AdminHome() {
  const t = await getTranslations('admin');
  const db = getDb();
  const [reports, unmatched] = await Promise.all([openReports(db), unmatchedQueue(db)]);
  return (
    <main className="space-y-2">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p>
        <Link href="/admin/reports" className="underline">{t('reports')}</Link>: {t('openReports', { count: reports.length })}
      </p>
      <p>
        <Link href="/admin/unmatched" className="underline">{t('unmatched')}</Link>: {t('openReports', { count: unmatched.length })}
      </p>
    </main>
  );
}
