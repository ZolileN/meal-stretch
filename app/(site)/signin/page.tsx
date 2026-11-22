/** §7.7 account prompt target: Google or email link. Skippable; nothing requires an account. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { signIn } from '@/auth';
import { anySignIn, signInMethods } from '@/lib/auth/methods';
import { sessionUser } from '@/lib/auth/session';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TopBar } from '@/components/ui/TopBar';
import { fieldClass, labelClass } from '@/components/ui/field';

export const dynamic = 'force-dynamic';

const safeNext = (v: string | undefined) => (v && /^\/[a-z0-9/_-]*$/i.test(v) ? v : '/plan');

export default async function SignIn({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations('auth');
  const user = await sessionUser();
  if (user) redirect(safeNext(sp.next));
  const next = safeNext(sp.next);
  const methods = signInMethods();

  async function google() {
    'use server';
    await signIn('google', { redirectTo: next });
  }
  async function email(form: FormData) {
    'use server';
    const parsed = z.string().trim().toLowerCase().email().max(200).safeParse(form.get('email'));
    if (!parsed.success) redirect('/signin?error=1');
    await signIn('resend', { email: parsed.data, redirectTo: next });
  }

  return (
    <main className="space-y-4 px-gutter pt-2 pb-8">
      <TopBar backHref={next} backLabel={t('skip')} />
      <h1 className="font-heading text-display font-extrabold text-primary">{t('title')}</h1>
      {sp.sent && (
        <p role="status" className="rounded-input bg-surface-muted px-4 py-3 text-small font-semibold text-success">
          {t('sent')}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-input bg-danger-soft px-4 py-3 text-small font-semibold text-danger">
          {t('error')}
        </p>
      )}
      {!anySignIn(methods) && <p className="rounded-input bg-surface-muted px-4 py-3 text-small text-text">{t('unavailable')}</p>}
      <Card className={anySignIn(methods) ? 'space-y-4 p-5' : 'hidden'}>
        {methods.google && (
          <form action={google}>
            <Button type="submit" size="lg">
              {t('google')}
            </Button>
          </form>
        )}
        {methods.google && methods.email && <p className="text-center text-small text-text-muted">{t('or')}</p>}
        {methods.email && (
          <form action={email} className="space-y-3">
            <label htmlFor="email" className={labelClass}>
              {t('emailLabel')}
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={fieldClass} />
            <Button type="submit" variant={methods.google ? 'secondary' : 'primary'} size="lg" icon={<Mail aria-hidden className="size-5" />}>
              {t('emailButtonSend')}
            </Button>
          </form>
        )}
      </Card>
      <Link href={next} className="tap inline-flex items-center text-small font-semibold text-text-muted underline">
        {t('skip')}
      </Link>
    </main>
  );
}
