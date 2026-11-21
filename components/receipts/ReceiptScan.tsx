'use client';
/** R1 receipt scan (§7.6): consent first time → compress → upload → poll → verified savings. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BRAND } from '@/lib/brand';
import { formatRandShort } from '@/lib/money';
import { compressImage } from '@/lib/offline/compress';

interface View {
  status: string;
  lines: { rawName: string; matched: boolean; priceCents: number }[];
  verified: { paidCents: number; normalCents: number; savedCents: number } | null;
}

export function ReceiptScan({ needsConsent }: { needsConsent: boolean }) {
  const t = useTranslations('receipts');
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(!needsConsent);
  const [id, setId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let stop = false;
    const poll = async () => {
      while (!stop) {
        const res = await fetch(`/api/receipts/${id}`).catch(() => null);
        if (res?.ok) {
          const v = (await res.json()) as View;
          if (v.status !== 'processing') {
            setView(v);
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return setError(t('needConsent'));
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      const form = new FormData();
      form.set('image', new File([blob], 'slip.jpg', { type: blob.type || 'image/jpeg' }));
      form.set('consent', String(consent));
      const res = await fetch('/api/receipts', { method: 'POST', body: form });
      const j = (await res.json()) as { receiptId?: string; error?: { code: string } };
      if (res.ok && j.receiptId) setId(j.receiptId);
      else setError(j.error?.code === 'cap_reached' ? t('cap') : t('failed'));
    } catch {
      setError(t('tooLarge'));
    } finally {
      setBusy(false);
    }
  };

  if (id && !view) return <p role="status" className="py-8 text-center text-lg">{t('reading')}</p>;
  if (view)
    return (
      <section className="space-y-3" data-testid="receipt-result">
        {view.status === 'verified' && view.verified && (
          <p className="rounded-xl bg-teal-50 p-3 text-lg font-semibold">
            {t('confirmed', { paid: formatRandShort(view.verified.paidCents), normal: formatRandShort(view.verified.normalCents), saved: formatRandShort(view.verified.savedCents) })}
          </p>
        )}
        {view.status === 'needs_review' && <p className="rounded-xl bg-amber-50 p-3">{t('needsReview')}</p>}
        {view.status === 'failed' && <p className="rounded-xl bg-red-50 p-3">{t('failed')}</p>}
        {view.lines.length > 0 && (
          <>
            <ul className="divide-y rounded-xl border text-sm">
              {view.lines.map((l, i) => (
                <li key={i} className="flex justify-between px-3 py-2">
                  <span>
                    <span aria-hidden>{l.matched ? '✓ ' : '? '}</span>
                    {l.rawName} <span className="sr-only">{l.matched ? t('matched') : t('notMatched')}</span>
                  </span>
                  <span>{formatRandShort(l.priceCents)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-600">{t('unmatchedNote')}</p>
          </>
        )}
        <div className="flex gap-2">
          <button type="button" className="tap rounded-xl border px-4" onClick={() => (setId(null), setView(null), setFile(null))}>
            {t('another')}
          </button>
          <Link href="/savings" className="tap flex items-center rounded-xl bg-brand px-4 font-semibold text-white">
            {t('toSavings')}
          </Link>
        </div>
      </section>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      <p>{t('intro')}</p>
      <label className="tap flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-6 font-semibold">
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? file.name : t('photo')}
      </label>
      {needsConsent && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {t('consent', { brand: BRAND.name })}
        </label>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
      <button type="submit" disabled={!file || busy} className="tap w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">
        {busy ? t('uploading') : t('upload')}
      </button>
    </form>
  );
}
