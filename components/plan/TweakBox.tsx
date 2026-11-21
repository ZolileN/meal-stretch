'use client';
/** PLN-13: free-text change → Claude-parsed constraints → engine re-run. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

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
    <form onSubmit={submit} className="space-y-2 rounded-2xl border p-4">
      <label htmlFor="tweak" className="font-semibold">
        {t('label')}
      </label>
      <div className="flex gap-2">
        <input id="tweak" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} className="tap flex-1 rounded-xl border px-3" />
        <button type="submit" disabled={busy} className="tap rounded-xl bg-brand px-3 font-semibold text-white">
          {busy ? t('working') : t('submit')}
        </button>
      </div>
      {msg && <p role="status" className="text-sm text-danger">{msg}</p>}
    </form>
  );
}
