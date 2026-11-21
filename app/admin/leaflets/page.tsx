/** ADM-2: upload a leaflet → Claude extraction → review. */
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { extractLeaflet } from '@/lib/leaflets';

export default async function Leaflets({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations('admin');
  const db = getDb();
  const retailers = await query<{ id: string; name: string }>(db, sql`select id, name from retailers where active order by name`);
  const batches = await query<{ id: number; retailer_id: string; status: string; created_at: string }>(
    db,
    sql`select id, retailer_id, status, created_at from ingest_batches where kind = 'leaflet' order by created_at desc limit 30`,
  );
  async function upload(f: FormData) {
    'use server';
    const admin = await requireAdmin();
    const file = f.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) redirect('/admin/leaflets?error=file');
    let id: number;
    try {
      id = await extractLeaflet(getDb(), { retailerId: String(f.get('retailer')), uploadedBy: admin.id, file: { base64: Buffer.from(await file.arrayBuffer()).toString('base64'), type: file.type } });
    } catch (e) {
      redirect(`/admin/leaflets?error=${encodeURIComponent((e as Error).message)}`);
    }
    redirect(`/admin/leaflets/${id}`);
  }
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">{t('leaflets')}</h1>
      {sp.error && <p className="rounded bg-danger-soft p-2">{sp.error}</p>}
      <form action={upload} className="flex flex-wrap items-end gap-2 rounded border p-3">
        <label>{t('retailer')}<select name="retailer" className="block rounded border px-2 py-1">{retailers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>{t('upload')}<input type="file" name="file" accept="application/pdf,image/*" required className="block" /></label>
        <button className="rounded bg-primary px-3 py-2 text-on-primary">{t('extract')}</button>
      </form>
      <ul className="text-sm">
        {batches.map((b) => (
          <li key={b.id}><Link className="underline" href={`/admin/leaflets/${b.id}`}>#{b.id}</Link> {b.retailer_id} · {b.status}</li>
        ))}
      </ul>
    </main>
  );
}
