'use client';
/** §7.7: shown only on a 2nd visit (another day), or before sharing with the household. Always skippable. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const KEY = 'ms_visit_days';
const DISMISSED = 'ms_account_prompt_dismissed';

function visitDays(): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const days = new Set<string>(JSON.parse(window.localStorage.getItem(KEY) ?? '[]'));
    days.add(today);
    window.localStorage.setItem(KEY, JSON.stringify([...days].slice(-10)));
    return days.size;
  } catch {
    return 1;
  }
}

export function AccountPrompt({ signedIn, force = false, onSkip }: { signedIn: boolean; force?: boolean; onSkip?: () => void }) {
  const t = useTranslations('account');
  const [show, setShow] = useState(force);
  useEffect(() => {
    if (signedIn || force) return;
    let dismissed = false;
    try {
      dismissed = Boolean(window.localStorage.getItem(DISMISSED));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dismissed && visitDays() >= 2) setShow(true);
  }, [signedIn, force]);
  if (signedIn || !show) return null;
  const skip = () => {
    try {
      if (!force) window.localStorage.setItem(DISMISSED, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
    onSkip?.();
  };
  return (
    <section className="rounded-2xl border-2 border-brand p-4" data-testid="account-prompt">
      <p className="font-semibold">{t('promptTitle')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link href="/signin" className="tap flex items-center rounded-xl bg-brand px-4 font-semibold text-white">
          {t('email')}
        </Link>
        <Link href="/signin" className="tap flex items-center rounded-xl border px-4 font-semibold">
          {t('google')}
        </Link>
        <button type="button" onClick={skip} className="tap rounded-xl px-4 text-gray-600 underline">
          {t('skip')}
        </button>
      </div>
    </section>
  );
}
