'use client';
/** R1 receipt scan (§7.6): consent first time → compress → upload → poll → verified savings. */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BRAND } from '@/lib/brand';
import { formatRandShort } from '@/lib/money';
import { compressImage } from '@/lib/offline/compress';
import { Camera, CircleCheck, CircleHelp, LoaderCircle } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyText } from '@/components/ui/MoneyText';

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

  if (id && !view)
    return (
      <Card as="div" className="flex flex-col items-center gap-3 p-8 text-center">
        <LoaderCircle aria-hidden className="size-8 animate-spin text-primary" />
        <p role="status" className="font-heading text-h3 font-bold text-primary">
          {t('reading')}
        </p>
      </Card>
    );
  if (view)
    return (
      <section className="space-y-3" data-testid="receipt-result">
        {view.status === 'verified' && view.verified && (
          <Card tone="savings" bordered={false} as="div" className="p-5">
            <p className="money font-semibold text-savings-text">
              {t('confirmed', { paid: formatRandShort(view.verified.paidCents), normal: formatRandShort(view.verified.normalCents), saved: formatRandShort(view.verified.savedCents) })}
            </p>
          </Card>
        )}
        {view.status === 'needs_review' && <p className="rounded-input bg-surface-muted px-4 py-3 text-small">{t('needsReview')}</p>}
        {view.status === 'failed' && <p className="rounded-input bg-danger-soft px-4 py-3 text-small text-danger">{t('failed')}</p>}
        {view.lines.length > 0 && (
          <>
            <Card as="div" className="overflow-hidden">
              <ul className="divide-y divide-border text-small">
                {view.lines.map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      {l.matched ? <CircleCheck aria-hidden className="size-4 shrink-0 text-success" /> : <CircleHelp aria-hidden className="size-4 shrink-0 text-text-muted" />}
                      <span className="min-w-0 break-words">{l.rawName}</span>
                      <span className="sr-only">{l.matched ? t('matched') : t('notMatched')}</span>
                    </span>
                    <MoneyText cents={l.priceCents} className="shrink-0" />
                  </li>
                ))}
              </ul>
            </Card>
            <p className="text-caption text-text-muted">{t('unmatchedNote')}</p>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => (setId(null), setView(null), setFile(null))}>
            {t('another')}
          </Button>
          <ButtonLink href="/savings">{t('toSavings')}</ButtonLink>
        </div>
      </section>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-text-muted">{t('intro')}</p>
      <label className="press tap flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-surface p-8 text-center font-semibold text-primary hover:border-primary-soft">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-savings-soft text-savings-text">
          <Camera className="size-6" />
        </span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <span className="break-all">{file ? file.name : t('photo')}</span>
      </label>
      {needsConsent && (
        <label className="flex cursor-pointer items-start gap-3 text-small">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {t('consent', { brand: BRAND.name })}
        </label>
      )}
      {error && (
        <p role="alert" className="rounded-input bg-danger-soft px-4 py-3 text-small font-semibold text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={!file} loading={busy} loadingLabel={t('uploading')}>
        {t('upload')}
      </Button>
    </form>
  );
}
