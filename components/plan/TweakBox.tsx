'use client';
/** PLN-13: free-text change → Claude-parsed constraints → engine re-run. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fieldClass } from '@/components/ui/field';

export function TweakBox({ planId }: { planId: string }) {
  const t = useTranslations('tweak');
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/plans/${planId}/tweak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setText('');
      router.refresh();
      return;
    }
    setMsg(res?.status === 422 ? t('notUnderstood') : res?.status === 429 ? t('cap') : t('failed'));
  };
  return (
    <Card as="form" onSubmit={submit} className="space-y-3 p-5" id="tweak-box">
      <label htmlFor="tweak" className="flex items-center gap-2 font-heading text-h3 font-bold text-primary">
        <Sparkles aria-hidden className="size-5 stroke-savings" />
        {t('label')}
      </label>
      <input id="tweak" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} className={fieldClass} />
      <Button type="submit" loading={busy} loadingLabel={t('working')} className="w-full">
        {t('submit')}
      </Button>
      {msg && (
        <p role="status" className="text-small text-danger">
          {msg}
        </p>
      )}
    </Card>
  );
}
