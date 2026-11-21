/** ADM-2 review table: edit / approve / reject per line → publish as leaflet observations. */
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { publishBatch, rejectBatch, reviewBatch, type Decision } from '@/lib/leaflets';
import { PROVINCES } from '@/lib/location/provinces';
import { formatRandShort } from '@/lib/money';

export default async function Review({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ published?: string; queued?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isSafeInteger(id)) notFound();
  const t = await getTranslations('admin');
  const b = await reviewBatch(getDb(), id);
  if (!b) notFound();
  async function publish(f: FormData) {
    'use server';
    await requireAdmin();
    const decisions: Decision[] = b!.lines.map((l) => {
      const pid = Number(f.get(`product_${l.index}`));
      const price = Number(f.get(`price_${l.index}`));
      const was = Number(f.get(`was_${l.index}`));
      return {
        index: l.index,
        action: f.get(`approve_${l.index}`) === 'on' ? 'approve' : 'reject',
        priceCents: Number.isSafeInteger(price) && price > 0 ? price : undefined,
        wasPriceCents: Number.isSafeInteger(was) && was > 0 ? was : null,
        productId: Number.isSafeInteger(pid) && pid > 0 ? pid : null,
      };
    });
    const r = await publishBatch(getDb(), id, decisions);
    redirect(`/admin/leaflets/${id}?published=${r.published}&queued=${r.queued}`);
  }
  async function reject() {
    'use server';
    await requireAdmin();
    await rejectBatch(getDb(), id);
    redirect('/admin/leaflets');
  }
  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-bold">{t('review')} #{b.id} · {b.retailerId} · {b.status}</h1>
      <p className="text-sm" data-testid="batch-scope">{b.province ? t('scopeApplies', { province: PROVINCES.find((p) => p.code === b.province)?.name ?? b.province }) : t('scopeAppliesNational')}</p>
      {sp.published && <p className="rounded bg-surface-muted p-2">{t('published_n', { published: Number(sp.published), queued: Number(sp.queued ?? 0) })}</p>}
      <form action={publish}>
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th>{t('approve')}</th><th>{t('rawName')}</th><th>{t('size')}</th><th>{t('price')}</th><th>{t('was')}</th><th>{t('member')}</th><th>{t('suggestion')}</th><th>{t('productId')}</th></tr></thead>
          <tbody>
            {b.lines.map((l) => (
              <tr key={l.index} className="border-b">
                <td><input type="checkbox" name={`approve_${l.index}`} defaultChecked={Boolean(l.suggestion)} disabled={b.status !== 'review'} /></td>
                <td>{l.raw_name}</td>
                <td>{l.size_text}</td>
                <td><input name={`price_${l.index}`} defaultValue={l.price_cents} className="w-20 rounded border px-1" /> <span className="text-text-muted">{formatRandShort(l.price_cents)}</span></td>
                <td><input name={`was_${l.index}`} defaultValue={l.was_price_cents ?? ''} className="w-20 rounded border px-1" /></td>
                <td>{l.member_only ? '✓' : ''}</td>
                <td>{l.suggestion ? `${l.suggestion.name} (${Math.round(l.suggestion.confidence * 100)}%)` : '—'}</td>
                <td><input name={`product_${l.index}`} defaultValue={l.suggestion?.productId ?? ''} className="w-20 rounded border px-1" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {b.status === 'review' && <button className="mt-3 rounded bg-primary px-3 py-2 text-on-primary">{t('publish')}</button>}
      </form>
      {b.status === 'review' && <form action={reject}><button className="rounded border px-3 py-2">{t('rejectBatch')}</button></form>}
    </main>
  );
}
