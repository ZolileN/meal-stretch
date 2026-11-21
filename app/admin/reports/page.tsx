/** ADM-5: branch reports queue. */
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { acceptReport, openReports, rejectReport } from '@/lib/admin/reports';

export default async function Reports() {
  const t = await getTranslations('admin');
  const reports = await openReports(getDb());
  async function accept(f: FormData) {
    'use server';
    await requireAdmin();
    await acceptReport(getDb(), Number(f.get('id')), { name: String(f.get('name') ?? '') || undefined, retailerId: String(f.get('retailer') ?? '') || undefined });
    revalidatePath('/admin/reports');
  }
  async function reject(f: FormData) {
    'use server';
    await requireAdmin();
    await rejectReport(getDb(), Number(f.get('id')));
    revalidatePath('/admin/reports');
  }
  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-bold">{t('reports')}</h1>
      {reports.length === 0 && <p>{t('none')}</p>}
      {reports.map((r) => (
        <div key={r.id} className="rounded border p-3 text-sm">
          <p>
            <b>{r.kind}</b> · {r.retailer_id ?? r.retailer_text} · {r.note} {r.lat !== null && `· ${Number(r.lat).toFixed(3)}, ${Number(r.lng).toFixed(3)}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={accept} className="flex gap-2">
              <input type="hidden" name="id" value={r.id} />
              {r.kind === 'missing' && <input name="name" placeholder={t('branchName')} required className="rounded border px-2" />}
              {r.kind === 'missing' && !r.retailer_id && <input name="retailer" placeholder={t('retailer')} required className="w-28 rounded border px-2" />}
              <button className="rounded bg-brand px-3 py-1 text-white">{t('accept')}</button>
            </form>
            <form action={reject}>
              <input type="hidden" name="id" value={r.id} />
              <button className="rounded border px-3 py-1">{t('reject')}</button>
            </form>
          </div>
        </div>
      ))}
    </main>
  );
}
