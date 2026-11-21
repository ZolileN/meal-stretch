'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fieldClass, labelClass } from '@/components/ui/field';

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
      <p role="status" className="flex flex-wrap items-center gap-2 text-small font-semibold text-success">
        {t('reportThanks')}
        <Button variant="ghost" onClick={onClose}>
          {t('close')}
        </Button>
      </p>
    );

  return (
    <Card as="form" onSubmit={submit} className="space-y-4 p-5" aria-label={t('reportTitle')}>
      <h3 className="font-heading text-h3 font-bold text-primary">{t('reportTitle')}</h3>
      <label className={labelClass}>
        {t('reportRetailer')}
        <select value={retailerId} onChange={(e) => setRetailerId(e.target.value)} className={`${fieldClass} mt-1.5 font-normal`}>
          {retailers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          <option value="other">{t('reportOther')}</option>
        </select>
      </label>
      {retailerId === 'other' && (
        <label className={labelClass}>
          {t('reportOtherName')}
          <input required maxLength={80} value={other} onChange={(e) => setOther(e.target.value)} className={`${fieldClass} mt-1.5 font-normal`} />
        </label>
      )}
      <label className={labelClass}>
        {t('reportNote')}
        <textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${fieldClass} mt-1.5 font-normal`} rows={2} />
      </label>
      {state === 'failed' && <p className="text-small text-danger">{t('reportFailed')}</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={state === 'sending'}>
          {t('reportSend')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </Card>
  );
}
