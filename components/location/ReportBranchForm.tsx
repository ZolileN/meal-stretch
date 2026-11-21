'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function ReportBranchForm({
  point,
  retailers,
  onClose,
}: {
  point: { lat: number; lng: number };
  retailers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations('location');
  const [retailerId, setRetailerId] = useState(retailers[0]?.id ?? 'other');
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    const res = await fetch('/api/reports/branch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'missing',
        retailerId: retailerId === 'other' ? null : retailerId,
        retailerText: retailerId === 'other' ? other : null,
        note: note || null,
        point,
      }),
    }).catch(() => null);
    setState(res?.ok ? 'sent' : 'failed');
  };

  if (state === 'sent')
    return (
      <p role="status" className="text-sm text-brand">
        {t('reportThanks')}{' '}
        <button type="button" className="tap underline" onClick={onClose}>
          {t('close')}
        </button>
      </p>
    );

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border p-3" aria-label={t('reportTitle')}>
      <h3 className="font-semibold">{t('reportTitle')}</h3>
      <label className="block text-sm">
        {t('reportRetailer')}
        <select value={retailerId} onChange={(e) => setRetailerId(e.target.value)} className="tap mt-1 w-full rounded-lg border px-3">
          {retailers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          <option value="other">{t('reportOther')}</option>
        </select>
      </label>
      {retailerId === 'other' && (
        <label className="block text-sm">
          {t('reportOtherName')}
          <input required maxLength={80} value={other} onChange={(e) => setOther(e.target.value)} className="tap mt-1 w-full rounded-lg border px-3" />
        </label>
      )}
      <label className="block text-sm">
        {t('reportNote')}
        <textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" rows={2} />
      </label>
      {state === 'failed' && <p className="text-sm text-danger">{t('reportFailed')}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={state === 'sending'} className="tap rounded-lg bg-brand px-4 font-semibold text-white">
          {t('reportSend')}
        </button>
        <button type="button" onClick={onClose} className="tap rounded-lg border px-4">
          {t('close')}
        </button>
      </div>
    </form>
  );
}
