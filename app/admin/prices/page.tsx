/** ADM-6: price health. */
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { priceHealth } from '@/lib/admin/health';

export default async function Prices() {
  const t = await getTranslations('admin');
  const rows = await priceHealth(getDb());
  return (
    <main>
      <h1 className="mb-3 text-2xl font-bold">{t('prices')}</h1>
      <table className="w-full text-sm" data-testid="price-health">
        <thead><tr className="text-left"><th>{t('retailer')}</th><th>{t('prices_count')}</th><th>{t('stale')}</th><th>{t('coverage')}</th><th>{t('newest')}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.retailerId} className="border-b">
              <td>{r.name}</td><td>{r.prices}</td><td className={r.stale ? 'text-danger' : ''}>{r.stale}</td><td>{r.coveragePct}%</td><td>{r.newest ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
