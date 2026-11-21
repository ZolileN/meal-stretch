'use client';
/** §7.7: shown only on a 2nd visit (another day), or before sharing with the household. Always skippable. */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

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
    <Card className="border-primary-soft p-5" data-testid="account-prompt">
      <p className="flex items-center gap-2 font-heading text-h3 font-bold text-primary">
        <UserRound aria-hidden className="size-5" />
        {t('promptTitle')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ButtonLink href="/signin">{t('email')}</ButtonLink>
        <ButtonLink href="/signin" variant="secondary">
          {t('google')}
        </ButtonLink>
        <Button variant="ghost" onClick={skip}>
          {t('skip')}
        </Button>
      </div>
    </Card>
  );
}
