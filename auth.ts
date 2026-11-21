/** Auth.js (ACC-2): Google + email magic link (Resend). Optional: everything works without an account. */
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { cookies } from 'next/headers';
import { createTranslator } from 'next-intl';
import type { Provider } from 'next-auth/providers';
import { getDb } from '@/lib/db';
import { env, features } from '@/lib/env';
import { dbAdapter } from '@/lib/auth/adapter';
import { attachDeviceHousehold } from '@/lib/auth/merge';
import { sendMagicLink } from '@/lib/auth/mail';
import { DEVICE_COOKIE } from '@/lib/household';
import { track } from '@/lib/events';
import { BRAND } from '@/lib/brand';
import en from '@/messages/runtime/en.json';

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();
  const providers: Provider[] = [];
  if (features.googleAuth()) providers.push(Google({ clientId: e.AUTH_GOOGLE_ID!, clientSecret: e.AUTH_GOOGLE_SECRET! }));
  if (features.emailAuth() || e.NODE_ENV !== 'production' || e.E2E) {
    providers.push(
      Resend({
        apiKey: e.RESEND_API_KEY ?? 'dev',
        from: e.EMAIL_FROM,
        maxAge: 24 * 3600,
        async sendVerificationRequest({ identifier, url }) {
          const t = createTranslator({ locale: 'en', messages: en, namespace: 'auth' });
          await sendMagicLink(identifier, url, { subject: t('emailSubject', { brand: BRAND.name }), body: t('emailBody'), button: t('emailButton') });
        },
      }),
    );
  }
  if (!e.AUTH_SECRET && e.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set in production');
  return {
    secret: e.AUTH_SECRET ?? 'dev-only-insecure-secret-do-not-use-in-production',
    trustHost: true,
    adapter: dbAdapter(getDb),
    session: { strategy: 'jwt' },
    providers,
    pages: { signIn: '/signin', verifyRequest: '/signin?sent=1', error: '/signin' },
    callbacks: {
      jwt({ token, user }) {
        if (user?.id) token.uid = user.id;
        return token;
      },
      session({ session, token }) {
        if (token.uid && session.user) session.user.id = token.uid as string;
        return session;
      },
    },
    events: {
      async signIn({ user, account, isNewUser }) {
        if (!user.id) return;
        const db = getDb();
        const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
        const householdId = await attachDeviceHousehold(db, user.id, deviceId);
        if (isNewUser) await track(db, householdId, 'account_created', { method: account?.provider ?? 'unknown' });
      },
    },
  };
});
