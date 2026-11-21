/** §7.7 account prompt target: Google or email link. Skippable; nothing requires an account. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { signIn } from '@/auth';
import { features } from '@/lib/env';
import { sessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const safeNext = (v: string | undefined) => (v && /^\/[a-z0-9/_-]*$/i.test(v) ? v : '/plan');

export default async function SignIn({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations('auth');
  const user = await sessionUser();
  if (user) redirect(safeNext(sp.next));
  const next = safeNext(sp.next);

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
    <main className="space-y-5 px-4 py-8">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      {sp.sent && (
        <p role="status" className="rounded-xl bg-teal-50 p-3">
          {t('sent')}
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3">
          {t('error')}
        </p>
      )}
      {features.googleAuth() && (
        <form action={google}>
          <button className="tap w-full rounded-xl border-2 px-4 py-3 font-semibold">{t('google')}</button>
        </form>
      )}
      <form action={email} className="space-y-2">
        <label htmlFor="email" className="block font-semibold">
          {t('emailLabel')}
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="tap w-full rounded-xl border px-3" />
        <button className="tap w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white">{t('emailButtonSend')}</button>
      </form>
      <Link href={next} className="tap inline-flex items-center text-sm text-gray-600 underline">
        {t('skip')}
      </Link>
    </main>
  );
}
