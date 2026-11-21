/** ADM-3: map raw names to products (creates aliases) or ignore. */
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { resolveUnmatched, unmatchedQueue } from '@/lib/leaflets';

export default async function Unmatched() {
  const t = await getTranslations('admin');
  const items = await unmatchedQueue(getDb());
  async function resolve(f: FormData) {
    'use server';
    await requireAdmin();
    const id = Number(f.get('id'));
    const pid = Number(f.get('productId'));
    await resolveUnmatched(getDb(), id, f.get('ignore') ? { ignore: true } : { productId: pid });
    revalidatePath('/admin/unmatched');
  }
  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-bold">{t('unmatched')}</h1>
      {items.length === 0 && <p>{t('none')}</p>}
      {items.map((i) => (
        <form key={i.id} action={resolve} className="flex flex-wrap items-center gap-2 border-b py-1 text-sm">
          <input type="hidden" name="id" value={i.id} />
          <span className="flex-1">{i.raw_name} {i.size_text} · {i.retailer_id} · {i.price_cents ?? ''}</span>
          <input name="productId" placeholder={t('productId')} className="w-24 rounded border px-1" />
          <button className="rounded bg-primary px-2 text-on-primary">{t('resolve')}</button>
          <button name="ignore" value="1" className="rounded border px-2">{t('ignore')}</button>
        </form>
      ))}
    </main>
  );
}
