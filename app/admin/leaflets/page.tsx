/** ADM-2: upload a leaflet → Claude extraction → review. */
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { extractLeaflet } from '@/lib/leaflets';
import { parseScope, PROVINCES } from '@/lib/location/provinces';

export default async function Leaflets({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations('admin');
  const db = getDb();
  const retailers = await query<{ id: string; name: string }>(db, sql`select id, name from retailers where active order by name`);
  const batches = await query<{ id: number; retailer_id: string; province: string | null; status: string; created_at: string }>(
    db,
    sql`select id, retailer_id, province, status, created_at from ingest_batches where kind = 'leaflet' order by created_at desc limit 30`,
  );
  async function upload(f: FormData) {
    'use server';
    const admin = await requireAdmin();
    const file = f.get('file');
    if (!(file instanceof File) || file.size === 0) redirect('/admin/leaflets?error=file');
    // Vercel accepts ~4.5 MB per request; bigger leaflets go through `pnpm import:leaflet` (no size limit).
    if (file.size > 4 * 1024 * 1024) redirect('/admin/leaflets?error=too_big');
    const province = parseScope(f.get('province'));
    if (province === undefined) redirect('/admin/leaflets?error=province');
    let id: number;
    try {
      id = await extractLeaflet(getDb(), { retailerId: String(f.get('retailer')), uploadedBy: admin.id, province, file: { base64: Buffer.from(await file.arrayBuffer()).toString('base64'), type: file.type } });
    } catch (e) {
      redirect(`/admin/leaflets?error=${encodeURIComponent((e as Error).message)}`);
    }
    redirect(`/admin/leaflets/${id}`);
  }
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">{t('leaflets')}</h1>
      {sp.error && <p className="rounded bg-danger-soft p-2" role="alert">{sp.error === 'too_big' ? t('leafletTooBig') : sp.error === 'file' ? t('leafletNoFile') : sp.error === 'province' ? t('leafletProvince') : sp.error}</p>}
      <p className="text-sm text-text-muted">{t('leafletHelp')}</p>
      <form action={upload} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <label>{t('retailer')}<select name="retailer" className="block rounded border px-2 py-1">{retailers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>
          {t('scope')}
          <select name="province" defaultValue="national" className="block rounded border px-2 py-1">
            <option value="national">{t('scopeNational')}</option>
            {PROVINCES.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        <label>{t('upload')}<input type="file" name="file" accept="application/pdf,image/*" required className="block" /></label>
        <button className="rounded bg-primary px-3 py-2 text-on-primary">{t('extract')}</button>
      </form>
      <ul className="text-sm">
        {batches.map((b) => (
          <li key={b.id}><Link className="underline" href={`/admin/leaflets/${b.id}`}>#{b.id}</Link> {b.retailer_id} · {b.province ?? t('scopeNational')} · {b.status}</li>
        ))}
      </ul>
    </main>
  );
}
