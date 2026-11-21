import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/** ADM-1: every admin page checks the role server-side. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const t = await getTranslations('admin');
  const links = [
    ['/admin/recipes', t('recipes')], ['/admin/leaflets', t('leaflets')], ['/admin/unmatched', t('unmatched')], ['/admin/reports', t('reports')],
    ['/admin/prices', t('prices')], ['/admin/pilot', t('pilot')],
  ] as const;
  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <nav className="mb-4 flex flex-wrap gap-3 border-b pb-2 text-sm font-semibold">
        <Link href="/admin">{t('title')}</Link>
        {links.map(([h, l]) => (
          <Link key={h} href={h} className="text-primary underline">
            {l}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
